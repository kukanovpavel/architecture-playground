import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ComponentIn(BaseModel):
    id: Optional[str] = None
    type: str
    name: str = ""
    x: float = 0
    y: float = 0
    props: dict = {}


class ComponentOut(ComponentIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


class ConnectionIn(BaseModel):
    id: Optional[str] = None
    source_id: str
    target_id: str
    protocol: str = "sync_http"
    label: str = ""


class ConnectionOut(ConnectionIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


class RequirementIn(BaseModel):
    id: Optional[str] = None
    kind: str  # functional | nonfunctional
    subtype: str
    params: dict = {}
    description: str = ""


class RequirementOut(RequirementIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


class ProjectCreate(BaseModel):
    name: str = "Untitled space"


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ProjectDetail(ProjectSummary):
    components: list[ComponentOut] = []
    connections: list[ConnectionOut] = []
    requirements: list[RequirementOut] = []


class ProjectGraphIn(BaseModel):
    """Full-graph replace payload used to save the canvas in one shot."""

    name: Optional[str] = None
    components: list[ComponentIn] = []
    connections: list[ConnectionIn] = []
    requirements: list[RequirementIn] = []


class Finding(BaseModel):
    severity: str  # error | warning | info
    rule_id: str
    message: str
    component_ids: list[str] = []
    connection_ids: list[str] = []
    requirement_id: Optional[str] = None
    # Raw values used to build `message`, so a client can render a localized
    # message from `rule_id` + `details` instead of the English `message`.
    details: dict = {}


class SimulationResult(BaseModel):
    mode: str
    findings: list[Finding]
