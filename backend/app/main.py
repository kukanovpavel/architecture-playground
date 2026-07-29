from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers import catalog, projects, simulate
from .seed_templates import seed_if_empty

Base.metadata.create_all(bind=engine)

with SessionLocal() as _db:
    seed_if_empty(_db)

app = FastAPI(title="Architecture Playground API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog.router)
app.include_router(projects.router)
app.include_router(simulate.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
