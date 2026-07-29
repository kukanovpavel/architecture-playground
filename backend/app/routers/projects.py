import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get_project_or_404(db: Session, project_id: str) -> models.Project:
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[schemas.ProjectSummary])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.updated_at.desc()).all()


@router.post("", response_model=schemas.ProjectDetail)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    project = models.Project(name=payload.name)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=schemas.ProjectDetail)
def get_project(project_id: str, db: Session = Depends(get_db)):
    return _get_project_or_404(db, project_id)


@router.put("/{project_id}", response_model=schemas.ProjectDetail)
def save_project_graph(
    project_id: str, payload: schemas.ProjectGraphIn, db: Session = Depends(get_db)
):
    """Replace the whole canvas (components/connections/requirements) in one shot."""
    project = _get_project_or_404(db, project_id)
    if payload.name:
        project.name = payload.name

    db.query(models.Component).filter_by(project_id=project_id).delete()
    db.query(models.Connection).filter_by(project_id=project_id).delete()
    db.query(models.Requirement).filter_by(project_id=project_id).delete()

    for c in payload.components:
        db.add(
            models.Component(
                id=c.id or uuid.uuid4().hex,
                project_id=project_id,
                type=c.type,
                name=c.name,
                x=c.x,
                y=c.y,
                props=c.props,
            )
        )
    for conn in payload.connections:
        db.add(
            models.Connection(
                id=conn.id or uuid.uuid4().hex,
                project_id=project_id,
                source_id=conn.source_id,
                target_id=conn.target_id,
                protocol=conn.protocol,
                label=conn.label,
            )
        )
    for r in payload.requirements:
        db.add(
            models.Requirement(
                id=r.id or uuid.uuid4().hex,
                project_id=project_id,
                kind=r.kind,
                subtype=r.subtype,
                params=r.params,
                description=r.description,
            )
        )

    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = _get_project_or_404(db, project_id)
    db.delete(project)
    db.commit()
