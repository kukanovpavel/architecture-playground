"""Seeds the 7 example architectures from the README as ready-made template
spaces, so a fresh database isn't empty on first run. Only runs once, when
the projects table has no rows yet — it never touches an existing database.
"""

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from . import models


def _uid() -> str:
    return uuid.uuid4().hex


def _comp(type_: str, name: str, x: float, y: float, props: Optional[dict] = None):
    return {"id": _uid(), "type": type_, "name": name, "x": x, "y": y, "props": props or {}}


def _conn(source_id: str, target_id: str, protocol: str = "sync_http", label: str = ""):
    return {"id": _uid(), "source_id": source_id, "target_id": target_id, "protocol": protocol, "label": label}


def _template(name: str, components: list[dict], connections: list[dict]) -> dict:
    return {"name": name, "components": components, "connections": connections}


def _build_templates() -> list[dict]:
    templates = []

    # 1. Horizontally scaled web tier
    client = _comp("client", "Client", 0, 150)
    lb = _comp("load_balancer", "Load Balancer", 220, 150)
    app1 = _comp("app_server", "App Server A", 440, 40)
    app2 = _comp("app_server", "App Server B", 440, 260)
    db = _comp("relational_db", "Relational DB", 660, 150)
    templates.append(_template(
        "Pattern 1 - Horizontally scaled web tier",
        [client, lb, app1, app2, db],
        [
            _conn(client["id"], lb["id"]),
            _conn(lb["id"], app1["id"]),
            _conn(lb["id"], app2["id"]),
            _conn(app1["id"], db["id"]),
            _conn(app2["id"], db["id"]),
        ],
    ))

    # 2. Cache-aside
    client = _comp("client", "Client", 0, 150)
    lb = _comp("load_balancer", "Load Balancer", 220, 150)
    app = _comp("app_server", "App Server", 440, 150)
    cache = _comp("app_cache", "App Cache", 660, 40)
    db = _comp("relational_db", "Relational DB", 660, 260)
    templates.append(_template(
        "Pattern 2 - Cache-aside",
        [client, lb, app, cache, db],
        [
            _conn(client["id"], lb["id"]),
            _conn(lb["id"], app["id"]),
            _conn(app["id"], cache["id"]),
            _conn(app["id"], db["id"]),
        ],
    ))

    # 3. CDN
    client = _comp("client", "Client", 0, 150)
    cdn = _comp("cdn", "CDN", 220, 150)
    lb = _comp("load_balancer", "Load Balancer", 440, 150)
    app = _comp("app_server", "App Server", 660, 150)
    db = _comp("relational_db", "Relational DB", 880, 150)
    templates.append(_template(
        "Pattern 3 - CDN in front of static content",
        [client, cdn, lb, app, db],
        [
            _conn(client["id"], cdn["id"]),
            _conn(cdn["id"], lb["id"]),
            _conn(lb["id"], app["id"]),
            _conn(app["id"], db["id"]),
        ],
    ))

    # 4. Async processing with a queue and worker
    client = _comp("client", "Client", 0, 150)
    app = _comp("app_server", "App Server", 220, 150)
    db = _comp("relational_db", "Relational DB", 440, 40)
    queue = _comp("message_queue", "Message Queue", 440, 260)
    worker = _comp("task_queue", "Task Queue / Worker", 660, 260)
    templates.append(_template(
        "Pattern 4 - Async processing with a queue and worker",
        [client, app, db, queue, worker],
        [
            _conn(client["id"], app["id"]),
            _conn(app["id"], db["id"]),
            _conn(app["id"], queue["id"], protocol="async_queue"),
            _conn(queue["id"], worker["id"]),
            _conn(worker["id"], db["id"]),
        ],
    ))

    # 5. Read replicas
    client = _comp("client", "Client", 0, 150)
    app = _comp("app_server", "App Server", 220, 150)
    primary = _comp("relational_db", "Primary DB", 440, 40)
    replica = _comp("relational_db", "Replica DB", 440, 260, {"availability_pct": 99.5})
    templates.append(_template(
        "Pattern 5 - Read replicas",
        [client, app, primary, replica],
        [
            _conn(client["id"], app["id"]),
            _conn(app["id"], primary["id"], label="writes"),
            _conn(app["id"], replica["id"], label="reads"),
            _conn(primary["id"], replica["id"], protocol="async_queue", label="replication"),
        ],
    ))

    # 6. API Gateway + microservices
    client = _comp("client", "Client", 0, 150)
    gw = _comp("api_gateway", "API Gateway", 220, 150)
    ms1 = _comp("microservice", "Microservice A", 440, 40)
    ms2 = _comp("microservice", "Microservice B", 440, 260)
    db1 = _comp("relational_db", "Relational DB", 660, 40)
    db2 = _comp("document_store", "Document Store", 660, 260)
    templates.append(_template(
        "Pattern 6 - API Gateway + microservices",
        [client, gw, ms1, ms2, db1, db2],
        [
            _conn(client["id"], gw["id"]),
            _conn(gw["id"], ms1["id"]),
            _conn(gw["id"], ms2["id"]),
            _conn(ms1["id"], db1["id"]),
            _conn(ms2["id"], db2["id"]),
        ],
    ))

    # 7. Database sharding
    client = _comp("client", "Client", 0, 150)
    app = _comp("app_server", "App Server", 220, 150)
    s1 = _comp("relational_db", "Shard 1", 440, 20)
    s2 = _comp("relational_db", "Shard 2", 440, 150)
    s3 = _comp("relational_db", "Shard 3", 440, 280)
    templates.append(_template(
        "Pattern 7 - Database sharding",
        [client, app, s1, s2, s3],
        [
            _conn(client["id"], app["id"]),
            _conn(app["id"], s1["id"]),
            _conn(app["id"], s2["id"]),
            _conn(app["id"], s3["id"]),
        ],
    ))

    return templates


def seed_if_empty(db: Session) -> None:
    if db.query(models.Project).first() is not None:
        return

    for tpl in _build_templates():
        project = models.Project(name=tpl["name"])
        db.add(project)
        db.flush()  # assign project.id

        for c in tpl["components"]:
            db.add(models.Component(
                id=c["id"], project_id=project.id, type=c["type"],
                name=c["name"], x=c["x"], y=c["y"], props=c["props"],
            ))
        for conn in tpl["connections"]:
            db.add(models.Connection(
                id=conn["id"], project_id=project.id, source_id=conn["source_id"],
                target_id=conn["target_id"], protocol=conn["protocol"], label=conn["label"],
            ))

    db.commit()
