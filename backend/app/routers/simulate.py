import asyncio

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import SessionLocal, get_db
from ..simulation.heuristics import run_heuristics
from ..simulation.loadsim import FlowGraph, LiveSimulation, Snapshot, base_arrival_rps, compute_tick

router = APIRouter(prefix="/api/projects", tags=["simulate"])

TICK_SECONDS = 0.5


def _snapshot(project: models.Project) -> Snapshot:
    return Snapshot(project.components, project.connections, project.requirements)


@router.post("/{project_id}/simulate", response_model=schemas.SimulationResult)
def simulate(project_id: str, mode: str = "heuristic", db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if mode == "heuristic":
        findings = run_heuristics(
            project.components, project.connections, project.requirements
        )
        return schemas.SimulationResult(mode="heuristic", findings=findings)

    if mode == "load":
        # One-shot steady state. The live/animated version is the WebSocket
        # endpoint below; this is here for scripting and quick inspection.
        snapshot = _snapshot(project)
        graph = FlowGraph(snapshot.components, snapshot.connections, snapshot.requirements)
        state = compute_tick(graph, base_arrival_rps(snapshot.requirements))
        return schemas.SimulationResult(mode="load", findings=[], load=state)

    raise HTTPException(status_code=400, detail=f"Unknown simulation mode: {mode}")


@router.websocket("/{project_id}/simulate/live")
async def simulate_live(websocket: WebSocket, project_id: str):
    """Streams load-simulation ticks until the client disconnects or sends stop.

    The project graph is snapshotted once at connect time so the DB session
    isn't held open for the lifetime of the stream.
    """
    await websocket.accept()

    db = SessionLocal()
    try:
        project = db.get(models.Project, project_id)
        if project is None:
            await websocket.send_json({"type": "error", "detail": "Project not found"})
            await websocket.close()
            return
        snapshot = _snapshot(project)
    finally:
        db.close()

    if not snapshot.components:
        await websocket.send_json({"type": "error", "detail": "Nothing to simulate"})
        await websocket.close()
        return

    sim = LiveSimulation(snapshot, tick_seconds=TICK_SECONDS)
    stop = asyncio.Event()

    async def receive_control():
        """Handles client messages: rate changes and an explicit stop."""
        try:
            while not stop.is_set():
                message = await websocket.receive_json()
                action = message.get("action")
                if action == "stop":
                    stop.set()
                    return
                if action == "set_rate":
                    rate = message.get("rps")
                    if isinstance(rate, (int, float)):
                        sim.set_base_rps(float(rate))
        except (WebSocketDisconnect, RuntimeError, ValueError):
            stop.set()

    control_task = asyncio.create_task(receive_control())

    try:
        await websocket.send_json(
            {
                "type": "started",
                "base_rps": sim.base_rps,
                "tick_seconds": TICK_SECONDS,
            }
        )
        while not stop.is_set():
            state = sim.next_tick()
            state["type"] = "tick"
            await websocket.send_json(state)
            try:
                await asyncio.wait_for(stop.wait(), timeout=TICK_SECONDS)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        stop.set()
        control_task.cancel()
        try:
            await websocket.close()
        except RuntimeError:
            pass
