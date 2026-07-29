from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..simulation.heuristics import run_heuristics

router = APIRouter(prefix="/api/projects", tags=["simulate"])


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
        raise HTTPException(
            status_code=501,
            detail="Load simulation isn't implemented yet — heuristic mode only for now.",
        )

    raise HTTPException(status_code=400, detail=f"Unknown simulation mode: {mode}")
