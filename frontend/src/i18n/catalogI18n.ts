import type { Category } from "../types";

interface CatalogText {
  label: string;
  description: string;
}

// Translated labels/descriptions for the backend's static component catalog
// (backend/app/catalog.py). Keyed by the same type keys the backend returns.
export const CATALOG_I18N: Record<string, { en: CatalogText; ru: CatalogText }> = {
  client: {
    en: { label: "Client", description: "Browser or mobile app issuing requests." },
    ru: { label: "Клиент", description: "Браузер или мобильное приложение, отправляющее запросы." },
  },
  dns: {
    en: {
      label: "DNS",
      description: "Translates domain names to IPs; enables geo/latency routing.",
    },
    ru: {
      label: "DNS",
      description: "Преобразует доменные имена в IP; позволяет геораспределённую маршрутизацию.",
    },
  },
  cdn: {
    en: {
      label: "CDN",
      description: "Geographically distributed edge cache for static/dynamic content.",
    },
    ru: {
      label: "CDN",
      description: "Географически распределённый кэш для статического и динамического контента.",
    },
  },
  load_balancer: {
    en: {
      label: "Load Balancer",
      description: "Distributes requests across servers; avoids single points of failure.",
    },
    ru: {
      label: "Балансировщик нагрузки",
      description: "Распределяет запросы между серверами; устраняет единую точку отказа.",
    },
  },
  reverse_proxy: {
    en: {
      label: "Reverse Proxy",
      description: "Centralizes internal services; SSL termination, security, caching.",
    },
    ru: {
      label: "Обратный прокси",
      description: "Централизует внутренние сервисы; терминирует SSL, безопасность, кэширование.",
    },
  },
  api_gateway: {
    en: {
      label: "API Gateway",
      description: "Single entry point that routes to backend services.",
    },
    ru: {
      label: "API-шлюз",
      description: "Единая точка входа, маршрутизирующая запросы к бэкенд-сервисам.",
    },
  },
  app_server: {
    en: {
      label: "App Server",
      description: "Stateless application/web server handling business logic.",
    },
    ru: {
      label: "Сервер приложений",
      description: "Не хранящий состояние сервер, обрабатывающий бизнес-логику.",
    },
  },
  microservice: {
    en: {
      label: "Microservice",
      description: "Independently deployable service with a narrow responsibility.",
    },
    ru: {
      label: "Микросервис",
      description: "Независимо развёртываемый сервис с узкой зоной ответственности.",
    },
  },
  relational_db: {
    en: {
      label: "Relational DB",
      description: "ACID-compliant structured storage with joins (e.g. Postgres).",
    },
    ru: {
      label: "Реляционная БД",
      description: "ACID-совместимое структурированное хранилище с join'ами (например, Postgres).",
    },
  },
  key_value_store: {
    en: {
      label: "Key-Value Store",
      description: "Fast O(1) lookups, often memory-backed (e.g. DynamoDB, Redis).",
    },
    ru: {
      label: "Key-Value хранилище",
      description: "Быстрый доступ O(1), часто в памяти (например, DynamoDB, Redis).",
    },
  },
  document_store: {
    en: {
      label: "Document Store",
      description: "Flexible-schema JSON/XML documents (e.g. MongoDB).",
    },
    ru: {
      label: "Документная БД",
      description: "Документы с гибкой схемой в формате JSON/XML (например, MongoDB).",
    },
  },
  wide_column_store: {
    en: {
      label: "Wide-Column Store",
      description: "Distributed column-oriented storage (e.g. Cassandra, BigTable).",
    },
    ru: {
      label: "Wide-column хранилище",
      description: "Распределённое колоночное хранилище (например, Cassandra, BigTable).",
    },
  },
  graph_db: {
    en: {
      label: "Graph DB",
      description: "Optimized for complex relationships between entities.",
    },
    ru: {
      label: "Графовая БД",
      description: "Оптимизирована для сложных связей между сущностями.",
    },
  },
  app_cache: {
    en: {
      label: "App Cache",
      description: "In-memory cache between app and database (e.g. Redis, Memcached).",
    },
    ru: {
      label: "Кэш приложения",
      description: "Кэш в памяти между приложением и БД (например, Redis, Memcached).",
    },
  },
  db_query_cache: {
    en: {
      label: "DB Query Cache",
      description: "Caches results at the query-execution level.",
    },
    ru: {
      label: "Кэш запросов БД",
      description: "Кэширует результаты на уровне выполнения запросов.",
    },
  },
  web_cache: {
    en: {
      label: "Web Cache",
      description: "Reverse-proxy caching of full responses (e.g. Varnish).",
    },
    ru: {
      label: "Веб-кэш",
      description: "Кэширование полных ответов на уровне обратного прокси (например, Varnish).",
    },
  },
  message_queue: {
    en: {
      label: "Message Queue",
      description: "Decouples producers/consumers via pub-sub (e.g. RabbitMQ, SQS).",
    },
    ru: {
      label: "Очередь сообщений",
      description: "Развязывает producer/consumer через pub-sub (например, RabbitMQ, SQS).",
    },
  },
  task_queue: {
    en: {
      label: "Task Queue / Worker",
      description: "Background job processing with scheduling (e.g. Celery).",
    },
    ru: {
      label: "Очередь задач / воркер",
      description: "Фоновая обработка задач с планированием (например, Celery).",
    },
  },
};

export const CATEGORY_I18N: Record<Category, { en: string; ru: string }> = {
  edge: { en: "Network / Edge", ru: "Сеть / периметр" },
  application: { en: "Application", ru: "Приложение" },
  data: { en: "Data storage", ru: "Хранилища данных" },
  caching: { en: "Caching", ru: "Кэширование" },
  async: { en: "Async", ru: "Асинхронность" },
};
