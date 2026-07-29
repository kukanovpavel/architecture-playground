"""Static component catalog, grounded in donnemartin/system-design-primer.

Each entry provides default simulation properties. `capacity_rps=None` means
effectively unbounded (e.g. the client itself). `managed_ha=True` marks
components that are conventionally treated as inherently redundant/managed
(DNS, CDN, load balancer, the client) so a single instance isn't flagged as a
single point of failure.
"""

CATEGORIES = ["edge", "application", "data", "caching", "async"]

CATALOG: dict[str, dict] = {
    # --- Network / Edge ---
    "client": {
        "label": "Client",
        "category": "edge",
        "capacity_rps": None,
        "latency_ms": 0,
        "availability_pct": 100.0,
        "managed_ha": True,
        "description": "Browser or mobile app issuing requests.",
    },
    "dns": {
        "label": "DNS",
        "category": "edge",
        "capacity_rps": 100000,
        "latency_ms": 20,
        "availability_pct": 100.0,
        "managed_ha": True,
        "description": "Translates domain names to IPs; enables geo/latency routing.",
    },
    "cdn": {
        "label": "CDN",
        "category": "edge",
        "capacity_rps": 100000,
        "latency_ms": 10,
        "availability_pct": 99.99,
        "managed_ha": True,
        "description": "Geographically distributed edge cache for static/dynamic content.",
    },
    "load_balancer": {
        "label": "Load Balancer",
        "category": "edge",
        "capacity_rps": 20000,
        "latency_ms": 1,
        "availability_pct": 99.99,
        "managed_ha": True,
        "description": "Distributes requests across servers; avoids single points of failure.",
    },
    "reverse_proxy": {
        "label": "Reverse Proxy",
        "category": "edge",
        "capacity_rps": 10000,
        "latency_ms": 1,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Centralizes internal services; SSL termination, security, caching.",
    },
    # --- Application ---
    "api_gateway": {
        "label": "API Gateway",
        "category": "application",
        "capacity_rps": 5000,
        "latency_ms": 5,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Single entry point that routes to backend services.",
    },
    "app_server": {
        "label": "App Server",
        "category": "application",
        "capacity_rps": 1000,
        "latency_ms": 20,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Stateless application/web server handling business logic.",
    },
    "microservice": {
        "label": "Microservice",
        "category": "application",
        "capacity_rps": 800,
        "latency_ms": 15,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Independently deployable service with a narrow responsibility.",
    },
    # --- Data storage ---
    "relational_db": {
        "label": "Relational DB",
        "category": "data",
        "capacity_rps": 500,
        "latency_ms": 15,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "ACID-compliant structured storage with joins (e.g. Postgres).",
    },
    "key_value_store": {
        "label": "Key-Value Store",
        "category": "data",
        "capacity_rps": 3000,
        "latency_ms": 3,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Fast O(1) lookups, often memory-backed (e.g. DynamoDB, Redis).",
    },
    "document_store": {
        "label": "Document Store",
        "category": "data",
        "capacity_rps": 600,
        "latency_ms": 12,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Flexible-schema JSON/XML documents (e.g. MongoDB).",
    },
    "wide_column_store": {
        "label": "Wide-Column Store",
        "category": "data",
        "capacity_rps": 2000,
        "latency_ms": 8,
        "availability_pct": 99.95,
        "managed_ha": False,
        "description": "Distributed column-oriented storage (e.g. Cassandra, BigTable).",
    },
    "graph_db": {
        "label": "Graph DB",
        "category": "data",
        "capacity_rps": 400,
        "latency_ms": 20,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Optimized for complex relationships between entities.",
    },
    # --- Caching ---
    "app_cache": {
        "label": "App Cache",
        "category": "caching",
        "capacity_rps": 5000,
        "latency_ms": 1,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "In-memory cache between app and database (e.g. Redis, Memcached).",
    },
    "db_query_cache": {
        "label": "DB Query Cache",
        "category": "caching",
        "capacity_rps": 4000,
        "latency_ms": 1,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Caches results at the query-execution level.",
    },
    "web_cache": {
        "label": "Web Cache",
        "category": "caching",
        "capacity_rps": 6000,
        "latency_ms": 1,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Reverse-proxy caching of full responses (e.g. Varnish).",
    },
    # --- Async ---
    "message_queue": {
        "label": "Message Queue",
        "category": "async",
        "capacity_rps": 10000,
        "latency_ms": 5,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Decouples producers/consumers via pub-sub (e.g. RabbitMQ, SQS).",
    },
    "task_queue": {
        "label": "Task Queue / Worker",
        "category": "async",
        "capacity_rps": 2000,
        "latency_ms": 10,
        "availability_pct": 99.9,
        "managed_ha": False,
        "description": "Background job processing with scheduling (e.g. Celery).",
    },
}

DATASTORE_TYPES = {
    "relational_db",
    "key_value_store",
    "document_store",
    "wide_column_store",
    "graph_db",
}
CACHE_TYPES = {"app_cache", "db_query_cache", "web_cache", "cdn"}
QUEUE_TYPES = {"message_queue", "task_queue"}
APP_TIER_TYPES = {"api_gateway", "app_server", "microservice"}


def effective_props(component_type: str, props: dict) -> dict:
    base = CATALOG.get(component_type, {})
    merged = {
        "capacity_rps": base.get("capacity_rps"),
        "latency_ms": base.get("latency_ms", 0),
        "availability_pct": base.get("availability_pct", 99.9),
        "replicas": 1,
        "managed_ha": base.get("managed_ha", False),
    }
    for key in ("capacity_rps", "latency_ms", "availability_pct", "replicas"):
        if props.get(key) is not None:
            merged[key] = props[key]
    return merged
