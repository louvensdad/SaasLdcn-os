from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

from fastapi import HTTPException, status

from app.data.foundation import CONTRACT_VERSION


def _component(
    component_id: str,
    category: str,
    name: str,
    provider: str,
    summary: str,
    *,
    best_for: Sequence[str] = (),
    avoid_when: Sequence[str] = (),
    tradeoffs: Sequence[str] = (),
    tags: Sequence[str] = (),
) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": component_id,
        "category": category,
        "name": name,
        "provider": provider,
        "summary": summary,
        "best_for": list(best_for),
        "avoid_when": list(avoid_when),
        "tradeoffs": list(tradeoffs),
        "tags": list(tags),
    }


INFRASTRUCTURE_COMPONENTS: list[dict[str, Any]] = [
    _component(
        "sqlite",
        "database",
        "SQLite",
        "sqlite",
        "Embedded relational database for local development and lightweight deployments.",
        best_for=("local prototyping", "single-node apps", "tests"),
        avoid_when=("multi-writer workloads", "large distributed systems"),
        tradeoffs=("simple to operate", "limited concurrency"),
        tags=("embedded", "relational"),
    ),
    _component(
        "postgresql",
        "database",
        "PostgreSQL",
        "postgresql",
        "Primary relational store for transactional systems and enterprise backends.",
        best_for=("enterprise APIs", "multi-tenant SaaS", "reporting"),
        avoid_when=("document-only models", "extreme write fan-out without tuning"),
        tradeoffs=("excellent ecosystem", "needs schema discipline"),
        tags=("relational", "transactional"),
    ),
    _component(
        "mysql",
        "database",
        "MySQL",
        "mysql",
        "Relational database for familiar operational patterns and broad hosting support.",
        best_for=("classic web backends", "CRUD SaaS", "admin systems"),
        avoid_when=("advanced relational features are required", "heavy analytics workloads"),
        tradeoffs=("broad adoption", "fewer advanced features than PostgreSQL"),
        tags=("relational", "classic"),
    ),
    _component(
        "mongodb",
        "database",
        "MongoDB",
        "mongodb",
        "Document database for flexible schemas and content-centric applications.",
        best_for=("content platforms", "rapid schema iteration", "event snapshots"),
        avoid_when=("strict relational integrity", "heavy joins"),
        tradeoffs=("schema flexibility", "weaker relational guarantees"),
        tags=("document", "schema-flexible"),
    ),
    _component(
        "redis",
        "cache",
        "Redis",
        "redis",
        "In-memory cache, session store and lightweight coordination layer.",
        best_for=("caching", "sessions", "queues", "rate limiting"),
        avoid_when=("durable primary storage", "large binary object storage"),
        tradeoffs=("very fast", "memory-bound"),
        tags=("cache", "session", "rate-limit"),
    ),
    _component(
        "rabbitmq",
        "queue",
        "RabbitMQ",
        "rabbitmq",
        "Message broker for routed, durable work queues and async background tasks.",
        best_for=("task queues", "reliable messaging", "bounded delivery semantics"),
        avoid_when=("very high streaming throughput", "simple fire-and-forget tasks"),
        tradeoffs=("flexible routing", "more broker management"),
        tags=("messaging", "broker"),
    ),
    _component(
        "kafka",
        "queue",
        "Kafka",
        "kafka",
        "Event streaming platform for high-throughput, append-only event pipelines.",
        best_for=("event-driven systems", "stream processing", "audit trails"),
        avoid_when=("small apps that only need a basic queue", "teams without broker operations maturity"),
        tradeoffs=("scales well", "higher operational complexity"),
        tags=("streaming", "events"),
    ),
    _component(
        "sqs",
        "queue",
        "Amazon SQS",
        "aws",
        "Managed queue for decoupled background processing in AWS-centric stacks.",
        best_for=("AWS deployments", "serverless workflows", "simple task offload"),
        avoid_when=("multi-cloud independence", "deep routing requirements"),
        tradeoffs=("managed and durable", "cloud lock-in"),
        tags=("managed", "aws"),
    ),
    _component(
        "local_storage",
        "object_storage",
        "Local Storage",
        "local",
        "File system storage for local-only builds and development environments.",
        best_for=("development", "prototypes", "single-host deployments"),
        avoid_when=("multi-instance deployments", "shared storage needs"),
        tradeoffs=("no external dependency", "no redundancy"),
        tags=("filesystem", "local"),
    ),
    _component(
        "s3",
        "object_storage",
        "Amazon S3",
        "aws",
        "Durable object storage for assets, uploads and generated artifacts.",
        best_for=("uploaded files", "media delivery", "durable assets"),
        avoid_when=("fully local-only deployments", "strict vendor avoidance"),
        tradeoffs=("durable and scalable", "cloud dependency"),
        tags=("object-storage", "aws"),
    ),
    _component(
        "cloudflare_r2",
        "object_storage",
        "Cloudflare R2",
        "cloudflare",
        "Object storage with edge-friendly delivery and no egress fees for many workloads.",
        best_for=("static assets", "landing pages", "global asset delivery"),
        avoid_when=("complex AWS-only estates", "unsupported edge-first tooling"),
        tradeoffs=("good edge integration", "different operational model than S3"),
        tags=("object-storage", "edge"),
    ),
    _component(
        "jwt",
        "auth_provider",
        "JWT",
        "local",
        "Token-based auth baseline for stateless APIs and edge-compatible applications.",
        best_for=("API auth", "mobile clients", "microservices"),
        avoid_when=("centralized identity governance is required", "long-lived browser sessions without refresh design"),
        tradeoffs=("simple and portable", "token revocation is harder"),
        tags=("auth", "token"),
    ),
    _component(
        "keycloak",
        "auth_provider",
        "Keycloak",
        "keycloak",
        "Self-hosted identity and access management for enterprise authorization flows.",
        best_for=("enterprise SSO", "RBAC", "shared identity governance"),
        avoid_when=("tiny deployments", "teams without identity operations"),
        tradeoffs=("strong control", "higher operational overhead"),
        tags=("auth", "sso", "enterprise"),
    ),
    _component(
        "auth0",
        "auth_provider",
        "Auth0",
        "auth0",
        "Managed identity platform for hosted authentication and identity policies.",
        best_for=("SaaS products", "rapid enterprise auth", "hosted identity"),
        avoid_when=("hard self-host requirements", "strict vendor-free stacks"),
        tradeoffs=("fastest to adopt", "subscription dependency"),
        tags=("auth", "managed"),
    ),
    _component(
        "clerk",
        "auth_provider",
        "Clerk",
        "clerk",
        "Developer-friendly identity layer for modern product teams and front-end heavy apps.",
        best_for=("Next.js apps", "fast auth rollout", "consumer SaaS"),
        avoid_when=("strict self-host requirements", "deeply custom identity policy"),
        tradeoffs=("excellent UX", "managed dependency"),
        tags=("auth", "frontend-friendly"),
    ),
    _component(
        "nextauth",
        "auth_provider",
        "NextAuth",
        "nextauth",
        "Authentication library tailored to Next.js application routing and session flows.",
        best_for=("Next.js apps", "BFF patterns", "session-based auth"),
        avoid_when=("non-Next.js stacks", "centralized IAM needs"),
        tradeoffs=("tight framework integration", "less enterprise IAM control"),
        tags=("auth", "nextjs"),
    ),
    _component(
        "prometheus",
        "observability",
        "Prometheus",
        "prometheus",
        "Metrics collection and alerting foundation for operational visibility.",
        best_for=("service metrics", "SLOs", "alerting"),
        avoid_when=("no metric discipline", "teams that cannot run a metrics backend"),
        tradeoffs=("powerful metrics", "requires retention planning"),
        tags=("metrics", "alerting"),
    ),
    _component(
        "grafana",
        "observability",
        "Grafana",
        "grafana",
        "Visualization layer for metrics, logs and operational dashboards.",
        best_for=("dashboards", "SRE workflows", "executive observability"),
        avoid_when=("no data sources", "minimal operational needs"),
        tradeoffs=("high visibility", "extra dashboard maintenance"),
        tags=("dashboards", "visualization"),
    ),
    _component(
        "opentelemetry",
        "observability",
        "OpenTelemetry",
        "opentelemetry",
        "Standard telemetry instrumentation for traces, logs and metrics pipelines.",
        best_for=("distributed tracing", "vendor-neutral telemetry", "service boundaries"),
        avoid_when=("no instrumentation ownership", "teams avoiding telemetry overhead"),
        tradeoffs=("portable telemetry", "requires disciplined instrumentation"),
        tags=("tracing", "telemetry"),
    ),
    _component(
        "sentry",
        "observability",
        "Sentry",
        "sentry",
        "Error monitoring and release health platform for fast failure detection.",
        best_for=("frontend errors", "backend exceptions", "release tracking"),
        avoid_when=("telemetry already fully covers incident needs", "strict no-SaaS stacks"),
        tradeoffs=("fast issue surfacing", "managed service dependency"),
        tags=("errors", "monitoring"),
    ),
    _component(
        "local",
        "deployment",
        "Local",
        "local",
        "Developer-local execution and validation environment.",
        best_for=("single developer workstations", "prototype validation", "offline demos"),
        avoid_when=("shared production delivery", "team deployments"),
        tradeoffs=("fast feedback", "not production-grade"),
        tags=("local", "developer"),
    ),
    _component(
        "docker_compose",
        "containerization",
        "Docker Compose",
        "docker",
        "Multi-service container baseline for local foundations and portable stacks.",
        best_for=("development", "microservice scaffolding", "portable dev environments"),
        avoid_when=("large orchestration estates", "platform-managed deployment only"),
        tradeoffs=("easy to start", "not a production scheduler"),
        tags=("containers", "local-dev"),
    ),
    _component(
        "kubernetes",
        "deployment",
        "Kubernetes",
        "kubernetes",
        "Cluster orchestration layer for complex production workloads.",
        best_for=("enterprise distributed systems", "platform teams", "multi-service control planes"),
        avoid_when=("small teams", "simple SaaS delivery"),
        tradeoffs=("extremely flexible", "operationally heavy"),
        tags=("orchestration", "platform"),
    ),
    _component(
        "vercel",
        "deployment",
        "Vercel",
        "vercel",
        "Managed deployment platform optimized for Next.js and frontend-first delivery.",
        best_for=("Next.js", "landing pages", "edge-rendered apps"),
        avoid_when=("self-host-only environments", "deep container orchestration needs"),
        tradeoffs=("great frontend velocity", "platform constraints"),
        tags=("frontend", "edge"),
    ),
    _component(
        "railway",
        "deployment",
        "Railway",
        "railway",
        "Managed deployment platform for rapid app and database delivery.",
        best_for=("early-stage SaaS", "small teams", "fast prototypes"),
        avoid_when=("strict infra ownership", "large regulated environments"),
        tradeoffs=("fastest path to deploy", "less control than raw infrastructure"),
        tags=("managed", "platform"),
    ),
    _component(
        "flyio",
        "deployment",
        "Fly.io",
        "flyio",
        "Edge-friendly app deployment platform for globally distributed workloads.",
        best_for=("global applications", "edge workloads", "containerized apps"),
        avoid_when=("purely internal systems", "teams avoiding platform-specific deployment targets"),
        tradeoffs=("good edge positioning", "more infra awareness needed"),
        tags=("edge", "containers"),
    ),
    _component(
        "nginx",
        "api_gateway",
        "NGINX",
        "nginx",
        "Reverse proxy and gateway baseline for routing, TLS and edge controls.",
        best_for=("web routing", "TLS termination", "simple gateway needs"),
        avoid_when=("API gateway policy orchestration is needed", "managed gateway already exists"),
        tradeoffs=("ubiquitous", "configuration can sprawl"),
        tags=("proxy", "gateway"),
    ),
    _component(
        "spring_cloud_gateway",
        "api_gateway",
        "Spring Cloud Gateway",
        "spring_cloud",
        "Gateway layer aligned with Spring ecosystems and reactive routing.",
        best_for=("Spring Boot microservices", "central route policies", "Java platform teams"),
        avoid_when=("non-Java gateways", "very simple edge routing"),
        tradeoffs=("ecosystem fit", "framework-specific"),
        tags=("gateway", "spring"),
    ),
    _component(
        "kong",
        "api_gateway",
        "Kong",
        "kong",
        "API gateway with strong plugin ecosystem and policy control.",
        best_for=("enterprise APIs", "policy-heavy routing", "multi-team governance"),
        avoid_when=("small static apps", "no gateway governance needed"),
        tradeoffs=("powerful policy surface", "additional platform layer"),
        tags=("api-gateway", "policy"),
    ),
    _component(
        "traefik",
        "api_gateway",
        "Traefik",
        "traefik",
        "Cloud-native reverse proxy and gateway for container environments.",
        best_for=("container platforms", "dynamic routing", "small platform teams"),
        avoid_when=("complex enterprise gateway governance", "legacy-only environments"),
        tradeoffs=("dynamic and lightweight", "less opinionated policy control"),
        tags=("gateway", "cloud-native"),
    ),
    _component(
        "postgres_full_text",
        "search",
        "PostgreSQL Full Text Search",
        "postgresql",
        "Search capability embedded in PostgreSQL for lightweight discovery and filtering.",
        best_for=("small-to-medium search needs", "single-database systems", "admin search"),
        avoid_when=("heavy ranking or very large corpora", "dedicated search cluster needed"),
        tradeoffs=("no extra service", "less powerful than dedicated search engines"),
        tags=("search", "database"),
    ),
    _component(
        "elasticsearch",
        "search",
        "Elasticsearch",
        "elasticsearch",
        "Dedicated search and indexing platform for large-scale retrieval and ranking.",
        best_for=("content search", "log search", "rich filters"),
        avoid_when=("simple search needs", "teams without search operations"),
        tradeoffs=("powerful retrieval", "needs tuning and maintenance"),
        tags=("search", "indexing"),
    ),
    _component(
        "meilisearch",
        "search",
        "Meilisearch",
        "meilisearch",
        "Fast developer-friendly search engine for product discovery flows.",
        best_for=("catalog search", "SaaS discovery", "simple relevance tuning"),
        avoid_when=("very large enterprise search estates", "advanced indexing complexity"),
        tradeoffs=("easy to adopt", "less flexible than Elasticsearch"),
        tags=("search", "developer-friendly"),
    ),
    _component(
        "pgvector",
        "vector_database",
        "pgvector",
        "postgresql",
        "Vector search extension for PostgreSQL-based AI retrieval and embeddings.",
        best_for=("RAG systems", "bounded vector sets", "database-centric AI apps"),
        avoid_when=("very large vector corpora", "highly specialized vector workloads"),
        tradeoffs=("simple relational integration", "not a dedicated vector system"),
        tags=("vector", "postgres"),
    ),
    _component(
        "qdrant",
        "vector_database",
        "Qdrant",
        "qdrant",
        "Dedicated vector database for semantic retrieval and similarity search.",
        best_for=("RAG systems", "semantic search", "embedding-heavy backends"),
        avoid_when=("no vector workload", "teams avoiding another stateful service"),
        tradeoffs=("purpose-built vector retrieval", "extra service to operate"),
        tags=("vector", "search"),
    ),
    _component(
        "pinecone",
        "vector_database",
        "Pinecone",
        "pinecone",
        "Managed vector database for hosted semantic retrieval.",
        best_for=("managed AI platforms", "fast vector rollout", "operationally simple AI backends"),
        avoid_when=("strict self-hosting requirements", "vendor-free stacks"),
        tradeoffs=("fastest hosted vector layer", "managed dependency"),
        tags=("vector", "managed"),
    ),
    _component(
        "smtp",
        "email_provider",
        "SMTP",
        "smtp",
        "Baseline email transport for transactional notifications and verification mail.",
        best_for=("basic email delivery", "self-hosted mail", "simple transactional mail"),
        avoid_when=("high volume marketing requirements", "email reputation automation needed"),
        tradeoffs=("universal compatibility", "manual deliverability management"),
        tags=("email", "transactional"),
    ),
    _component(
        "resend",
        "email_provider",
        "Resend",
        "resend",
        "Developer-first transactional email service for product notifications.",
        best_for=("SaaS notifications", "product onboarding", "fast integration"),
        avoid_when=("strict self-host email infrastructure", "legacy SMTP-only flows"),
        tradeoffs=("developer friendly", "managed email dependency"),
        tags=("email", "transactional"),
    ),
    _component(
        "sendgrid",
        "email_provider",
        "SendGrid",
        "sendgrid",
        "Managed email platform for transactional and notification delivery at scale.",
        best_for=("transactional email", "high-volume delivery", "team collaboration"),
        avoid_when=("vendor-free requirements", "tiny dev-only deployments"),
        tradeoffs=("well-known delivery platform", "managed dependency"),
        tags=("email", "delivery"),
    ),
    _component(
        "stripe",
        "payment_provider",
        "Stripe",
        "stripe",
        "Primary payments infrastructure for subscriptions, checkout and billing flows.",
        best_for=("global SaaS billing", "marketplaces", "subscription checkout"),
        avoid_when=("local-only projects", "markets where Stripe is unavailable"),
        tradeoffs=("excellent ecosystem", "regional coverage limits"),
        tags=("payments", "billing"),
    ),
    _component(
        "mercado_pago",
        "payment_provider",
        "Mercado Pago",
        "mercado_pago",
        "Payment provider optimized for Latin American markets and local card rails.",
        best_for=("LATAM commerce", "regional payment flows", "marketplaces"),
        avoid_when=("global-only payment stacks without LATAM focus", "non-payment products"),
        tradeoffs=("excellent regional fit", "less global reach than Stripe"),
        tags=("payments", "latam"),
    ),
]

COMPONENT_BY_ID = {item["id"]: item for item in INFRASTRUCTURE_COMPONENTS}
INFRASTRUCTURE_CATEGORIES = [
    "database",
    "cache",
    "queue",
    "object_storage",
    "auth_provider",
    "observability",
    "deployment",
    "containerization",
    "api_gateway",
    "search",
    "vector_database",
    "email_provider",
    "payment_provider",
]


class InfrastructureRegistryService:
    def list_components(self) -> list[dict[str, Any]]:
        return list(INFRASTRUCTURE_COMPONENTS)

    def list_categories(self) -> list[str]:
        return list(INFRASTRUCTURE_CATEGORIES)

    def get_component(self, component_id: str) -> dict[str, Any]:
        component = COMPONENT_BY_ID.get(component_id)
        if component is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Infrastructure component '{component_id}' was not found.",
            )
        return component

    def get_recommendations(self, selection: dict[str, Any]) -> dict[str, Any]:
        profile = self.build_profile(selection)
        return dict(profile["recommendation"])

    def build_profile(self, selection: dict[str, Any]) -> dict[str, Any]:
        language_id = str(selection.get("language_id") or "")
        framework_id = str(selection.get("framework_id") or "")
        architecture_id = str(selection.get("architecture_id") or "")
        archetype_id = str(selection.get("archetype_id") or "")
        architecture_level = str(selection.get("architecture_level") or "")
        capability_ids = {str(item).strip() for item in selection.get("capability_ids", []) if str(item).strip()}
        selected_component_ids = list(dict.fromkeys(str(item).strip() for item in selection.get("selected_component_ids", []) if str(item).strip()))

        recommended: set[str] = set()
        required: set[str] = set()
        optional: set[str] = set()
        warnings: list[str] = []
        rationale: list[str] = []

        def note(message: str) -> None:
            if message not in rationale:
                rationale.append(message)

        def warn(message: str) -> None:
            if message not in warnings:
                warnings.append(message)

        if architecture_id in {"microservices", "distributed_system"}:
            required.update({"postgresql", "redis", "docker_compose", "opentelemetry"})
            recommended.update({"prometheus", "grafana", "kafka", "rabbitmq"})
            optional.update({"kong", "traefik", "nginx", "kubernetes"})
            note("Distributed architectures benefit from a relational source of truth, caching and baseline telemetry.")
            warn("Choose a primary broker between Kafka and RabbitMQ unless you are intentionally splitting messaging patterns.")

        if architecture_id in {"modular_monolith", "clean_architecture", "hexagonal", "monolith"}:
            recommended.update({"postgresql", "redis", "docker_compose", "opentelemetry"})
            optional.update({"nginx", "grafana", "smtp"})
            note("Composable monoliths work best with one primary relational store and a light operational baseline.")

        if architecture_id == "serverless":
            recommended.update({"vercel", "cloudflare_r2", "resend", "sentry"})
            optional.update({"smtp", "opentelemetry"})
            note("Serverless delivery benefits from managed deployment, object storage and error monitoring.")

        if framework_id == "spring_boot":
            recommended.update({"postgresql", "redis", "kafka", "rabbitmq", "docker_compose", "prometheus", "grafana", "opentelemetry"})
            if architecture_id == "microservices":
                required.update({"postgresql", "redis", "docker_compose", "opentelemetry"})
            optional.update({"spring_cloud_gateway", "kubernetes", "nginx"})
            note("Spring Boot enterprise baselines are strongest with PostgreSQL, Redis and one message broker.")

        if framework_id == "nestjs":
            recommended.update({"postgresql", "redis", "docker_compose", "opentelemetry", "sentry"})
            optional.update({"rabbitmq", "kafka", "kong", "traefik"})
            note("NestJS benefits from modular state, background queues and explicit telemetry boundaries.")

        if framework_id == "nextjs":
            required.update({"vercel", "postgresql"})
            recommended.update({"nextauth", "clerk", "sentry", "cloudflare_r2"})
            optional.update({"redis", "opentelemetry", "railway", "flyio"})
            note("Next.js delivery is strongest when deployment, auth and data are managed early.")

        if framework_id in {"react", "angular"}:
            recommended.update({"vercel", "sentry", "cloudflare_r2"})
            optional.update({"local_storage", "opentelemetry"})
            note("Frontend-heavy applications gain from a managed deployment target and error monitoring.")

        if framework_id == "fastapi":
            recommended.update({"postgresql", "redis", "docker_compose", "opentelemetry", "sentry"})
            optional.update({"pgvector", "qdrant", "pinecone", "cloudflare_r2"})
            note("FastAPI backends stay healthy with explicit async boundaries, telemetry and a relational store.")

        if framework_id == "django":
            recommended.update({"postgresql", "redis", "docker_compose", "sentry", "resend"})
            optional.update({"nginx", "opentelemetry"})
            note("Django foundations work well with PostgreSQL, cache and managed notification delivery.")

        if framework_id == "aspnet_core":
            recommended.update({"postgresql", "redis", "docker_compose", "opentelemetry"})
            optional.update({"keycloak", "auth0", "kong", "nginx"})
            note("ASP.NET Core services usually need a relational store, cache and a clear gateway/auth boundary.")

        if framework_id == "laravel":
            recommended.update({"mysql", "redis", "docker_compose", "resend", "smtp"})
            optional.update({"stripe", "mercado_pago", "rabbitmq", "kafka", "sqs"})
            note("Laravel foundations are efficient with a relational store, cache, email and background processing.")

        if framework_id in {"gin", "fiber"}:
            recommended.update({"postgresql", "redis", "docker_compose", "opentelemetry", "nginx"})
            optional.update({"kubernetes", "rabbitmq", "kafka"})
            note("Go APIs benefit from clear operational boundaries and lightweight gateway defaults.")

        if "authentication" in capability_ids or "rbac" in capability_ids or framework_id in {"spring_boot", "nestjs", "aspnet_core"}:
            recommended.update({"jwt", "keycloak", "auth0"})
            optional.update({"clerk", "nextauth"})
            note("Enterprise authentication should favor JWT plus a managed or self-hosted identity provider.")

        if "payments" in capability_ids:
            recommended.update({"stripe", "mercado_pago", "sentry"})
            optional.update({"postgresql"})
            warn("Pair payment flows with audit logs in the application layer and webhook verification in the gateway layer.")
            note("Payment systems need a provider, durable persistence and strong operational visibility.")

        if "ai_chat" in capability_ids or "rag" in capability_ids:
            required.update({"postgresql", "redis", "opentelemetry"})
            recommended.update({"pgvector", "qdrant", "pinecone", "cloudflare_r2"})
            optional.update({"sentry", "docker_compose"})
            warn("Add rate limiting or a WAF outside this registry for AI workloads that can be saturated by retries.")
            note("AI retrieval paths should keep vector storage and telemetry explicit.")

        if "search" in capability_ids:
            recommended.update({"postgres_full_text", "meilisearch", "elasticsearch"})
            optional.update({"postgresql"})
            note("Search-heavy systems benefit from choosing a dedicated search strategy rather than ad hoc filtering only.")

        if archetype_id == "landing_page" or framework_id == "nextjs" and "authentication" not in capability_ids and "payments" not in capability_ids:
            recommended.update({"vercel", "cloudflare_r2", "resend", "smtp"})
            optional.update({"sentry"})
            note("Static and landing-page experiences should prioritize edge deployment and lightweight forms/email.")

        if architecture_level in {"level_3_enterprise", "enterprise"}:
            optional.update({"kubernetes", "grafana", "keycloak"})
            note("Enterprise-level delivery usually needs stronger orchestration and identity governance options.")

        if not recommended and not required:
            recommended.update({"postgresql", "redis", "docker_compose", "opentelemetry"})
            optional.update({"grafana", "sentry"})
            note("A safe default foundation uses a relational database, cache, containers and telemetry.")

        if framework_id == "nextjs" and ("clerk" in recommended or "nextauth" in recommended):
            warn("Choose one primary Next.js auth provider unless you intentionally support multiple identity paths.")

        if {"pgvector", "qdrant", "pinecone"} <= (recommended | optional):
            warn("Choose one primary vector database unless you are deliberately comparing providers.")

        selected_known = [component_id for component_id in selected_component_ids if component_id in COMPONENT_BY_ID]

        profile = {
            "contractVersion": CONTRACT_VERSION,
            "language_id": language_id,
            "runtime_id": str(selection.get("runtime_id") or ""),
            "framework_id": framework_id,
            "architecture_id": architecture_id,
            "archetype_id": archetype_id,
            "architecture_level": architecture_level,
            "selected_component_ids": selected_known,
            "components": [COMPONENT_BY_ID[item_id] for item_id in self._merge_component_ids(selected_known, recommended, required, optional)],
            "recommendation": {
                "contractVersion": CONTRACT_VERSION,
                "recommended": self._sorted_components(recommended),
                "required": self._sorted_components(required),
                "optional": self._sorted_components(optional),
                "warnings": warnings,
                "rationale": rationale,
            },
        }
        return profile

    def _merge_component_ids(self, *groups: Iterable[str]) -> list[str]:
        merged: list[str] = []
        for group in groups:
            for component_id in group:
                if component_id not in merged and component_id in COMPONENT_BY_ID:
                    merged.append(component_id)
        return merged

    def _sorted_components(self, component_ids: Iterable[str]) -> list[str]:
        return sorted(dict.fromkeys(component_ids))
