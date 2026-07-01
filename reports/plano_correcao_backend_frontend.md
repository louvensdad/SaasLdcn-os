# Plano de Correção — Backend & Frontend
**Data:** 2026-06-30  
**Branch base:** `feat/premium-foundation`  
**Referência:** `reports/enterprise_audit_2026-06-30.md`

---

## Como ler este documento

Cada etapa é **independente e entregável** — pode ser feita em um PR separado e validada antes da próxima. A ordem importa: etapas de infraestrutura habilitam as etapas seguintes.

Legenda de risco:
- 🔴 Bloqueador de produção
- 🟡 Risco de regressão moderado — testar com cuidado
- 🟢 Sem impacto em funcionalidade existente

---

## BACKEND

---

### Etapa B1 — PostgreSQL + Alembic (substituir SQLite como banco principal)
**Risco:** 🔴 | **Estimativa:** 3 dias | **Prioridade:** P0

**Por que primeiro:** Todos os outros problemas de dados (índices, migrations, multi-tenant) dependem de ter um banco real com schema versionado.

#### Arquivos a criar

**`apps/api/app/core/database.py`** (novo)
```python
from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _engine():
    settings = get_settings()
    url = settings.database_url
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        kwargs["pool_size"] = 10
        kwargs["max_overflow"] = 20
        kwargs["pool_pre_ping"] = True
    return create_engine(url, **kwargs)


engine = _engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
```

**`apps/api/app/models/`** (nova pasta) — converter as tabelas de raw SQL para modelos SQLAlchemy:

```python
# apps/api/app/models/user.py
from sqlalchemy import Boolean, Column, String, Text
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    user_id = Column(String, primary_key=True)
    email = Column(String, nullable=False, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")
    locale = Column(String, nullable=False, default="pt-BR")
    is_active = Column(Boolean, nullable=False, default=True)
    consent_accepted_at = Column(String, nullable=True)
    consent_policy_version = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    jti = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    expires_at = Column(String, nullable=False, index=True)  # índice que faltava
    revoked = Column(Boolean, nullable=False, default=False)
    created_at = Column(String, nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True, index=True)
    event_code = Column(String, nullable=False, index=True)   # índice que faltava
    created_at = Column(String, nullable=False, index=True)   # índice que faltava
```

#### Arquivos a modificar

**`apps/api/requirements.txt`** — adicionar:
```
sqlalchemy>=2.0.0
alembic>=1.13.0
psycopg2-binary>=2.9.0   # PostgreSQL driver
redis>=5.0.0              # necessário para Etapa B2 e B3
```

**`apps/api/app/core/config.py`** — adicionar campo `database_url`:
```python
# substituir sqlite_path por:
database_url: str = Field(
    default_factory=lambda: os.environ.get(
        "LDCN_DATABASE_URL",
        f"sqlite:///{DATA_DIR}/ldcn_os.db"
    )
)
```

#### Inicializar Alembic
```bash
cd apps/api
alembic init alembic
# editar alembic/env.py para usar app.core.database.Base e settings.database_url
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

#### Remover de `user_repository.py`
- Todo o bloco `CREATE TABLE IF NOT EXISTS` dos métodos `initialize()`
- O método `initialize()` em si (chamada no `lifespan` do `main.py` também deve sair)
- Substituir `sqlite3.connect(...)` por `SessionLocal()`

#### Teste de validação
```bash
LDCN_DATABASE_URL=postgresql://user:pass@localhost/ldcn_test pytest apps/api/tests/ -x
LDCN_DATABASE_URL=sqlite:///./test.db pytest apps/api/tests/ -x   # deve continuar funcionando
```

---

### Etapa B2 — Redis: Rate Limiter distribuído
**Risco:** 🟡 | **Estimativa:** 1 dia | **Prioridade:** P0

**Por que:** Com 2 instâncias do servidor, o rate limiter atual não limita nada.

#### Arquivos a modificar

**`apps/api/app/core/config.py`** — adicionar:
```python
redis_url: str = Field(
    default_factory=lambda: os.environ.get("LDCN_REDIS_URL", "")
)
```

**`apps/api/app/core/rate_limit.py`** — substituir `_hits: dict` por backend plugável:

```python
from __future__ import annotations

import time
from collections import deque
from collections.abc import Awaitable, Callable
from typing import Protocol

from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.config import Settings, get_settings
from app.core.security import TokenError, decode_token


class RateLimitBackend(Protocol):
    async def is_allowed(self, key: str, limit: int, window: int) -> bool: ...


class InMemoryBackend:
    """Fallback quando Redis não está disponível. Funciona apenas em single-process."""
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}

    async def is_allowed(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] < now - window:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True


class RedisBackend:
    """Sliding window via Redis sorted set. Funciona em multi-instance."""
    def __init__(self, redis_url: str) -> None:
        import redis.asyncio as aioredis
        self._redis = aioredis.from_url(redis_url, decode_responses=True)

    async def is_allowed(self, key: str, limit: int, window: int) -> bool:
        now = time.time()
        pipe = self._redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window + 1)
        results = await pipe.execute()
        count = results[2]
        if count > limit:
            await self._redis.zremrangebyrank(key, -1, -1)  # desfaz o zadd
            return False
        return True


def _build_backend(settings: Settings) -> RateLimitBackend:
    if settings.redis_url:
        return RedisBackend(settings.redis_url)
    return InMemoryBackend()


class RateLimitMiddleware(BaseHTTPMiddleware):
    _WINDOW_SECONDS = 60

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._backend: RateLimitBackend | None = None

    def _get_backend(self) -> RateLimitBackend:
        if self._backend is None:
            self._backend = _build_backend(get_settings())
        return self._backend

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return await call_next(request)

        bucket, limit = self._bucket(request, settings)
        identity = self._identity(request, settings)
        key = f"rl:{identity}:{bucket}"

        allowed = await self._get_backend().is_allowed(key, limit, self._WINDOW_SECONDS)
        if not allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"error": {"code": "rate_limited", "message": "Too many requests.", "details": []}},
                headers={"Retry-After": str(self._WINDOW_SECONDS)},
            )
        return await call_next(request)

    # _bucket e _identity: mantidos iguais ao original
```

---

### Etapa B3 — Redis: User Key Vault distribuído
**Risco:** 🟡 | **Estimativa:** 1 dia | **Prioridade:** P0

**Por que:** Chaves LLM do usuário desaparecem quando a requisição cai em outra instância.

**`apps/api/app/services/user_key_session_service.py`** — substituir `_vault: dict` por Redis:

```python
from __future__ import annotations

import time
from app.core.config import get_settings
from app.core.security import decrypt_secret, encrypt_secret
from app.data.model_registry import DEFAULT_MODEL, MODEL_REGISTRY

_PROVIDERS = {"anthropic", "openai", "google", "openrouter", "deepseek", "custom"}


def mask_key(raw: str) -> str:
    tail = raw[-4:] if len(raw) >= 4 else ""
    return f"••••{tail}"


class UserKeySessionService:
    """Vault distribuído via Redis quando disponível; fallback em memória para dev."""

    def _redis(self):
        settings = get_settings()
        if not settings.redis_url:
            return None
        import redis
        return redis.from_url(settings.redis_url, decode_responses=True)

    def _ttl(self) -> int:
        return max(1, int(get_settings().user_key_ttl_seconds))

    def _key(self, user_id: str, provider: str) -> str:
        return f"vault:{user_id}:{provider}"

    def set(self, user_id: str, provider: str, api_key: str) -> str:
        provider = provider.strip().lower()
        if provider not in _PROVIDERS:
            raise ValueError(f"Unsupported provider '{provider}'.")
        api_key = api_key.strip()
        if not api_key:
            raise ValueError("API key must not be empty.")
        masked = mask_key(api_key)
        token = encrypt_secret(api_key)
        r = self._redis()
        if r:
            # armazena token:masked no Redis com TTL
            r.setex(self._key(user_id, provider), self._ttl(), f"{token}::{masked}")
        else:
            # fallback em memória (dev/single-instance)
            import threading
            if not hasattr(self, "_mem"):
                self._mem: dict = {}
                self._lock = threading.Lock()
            with self._lock:
                self._mem.setdefault(user_id, {})[provider] = (token, masked, time.time() + self._ttl())
        return masked

    def get(self, user_id: str, provider: str) -> str | None:
        provider = provider.strip().lower()
        r = self._redis()
        if r:
            raw = r.get(self._key(user_id, provider))
            if not raw:
                return None
            token = raw.split("::")[0]
            return decrypt_secret(token)
        # fallback memória
        if not hasattr(self, "_mem"):
            return None
        import threading
        with getattr(self, "_lock", threading.Lock()):
            entry = self._mem.get(user_id, {}).get(provider)
            if entry is None or entry[2] <= time.time():
                return None
            return decrypt_secret(entry[0])

    def clear(self, user_id: str, provider: str | None = None) -> None:
        r = self._redis()
        if r:
            if provider:
                r.delete(self._key(user_id, provider.strip().lower()))
            else:
                for p in _PROVIDERS:
                    r.delete(self._key(user_id, p))
        elif hasattr(self, "_mem"):
            import threading
            with getattr(self, "_lock", threading.Lock()):
                if provider:
                    self._mem.get(user_id, {}).pop(provider.strip().lower(), None)
                else:
                    self._mem.pop(user_id, None)

    def resolve_for_model_choice(self, user_id: str, user_model_choice: str | None) -> str | None:
        model = user_model_choice if (user_model_choice and user_model_choice in MODEL_REGISTRY) else DEFAULT_MODEL
        provider = MODEL_REGISTRY[model]["provider"]
        return self.get(user_id, provider)

    def status(self, user_id: str) -> list[tuple[str, str]]:
        result = []
        r = self._redis()
        if r:
            for p in sorted(_PROVIDERS):
                raw = r.get(self._key(user_id, p))
                if raw:
                    masked = raw.split("::")[-1] if "::" in raw else "••••????"
                    result.append((p, masked))
        return result


user_key_session = UserKeySessionService()
```

---

### Etapa B4 — Jobs de geração persistidos no banco
**Risco:** 🔴 | **Estimativa:** 2 dias | **Prioridade:** P0

**Por que:** Restart do servidor destrói todos os jobs em execução e histórico de geração.

#### Novo modelo

```python
# apps/api/app/models/generation_job.py
from sqlalchemy import Column, String, Text, Boolean, Integer
from app.core.database import Base

class GenerationJob(Base):
    __tablename__ = "generation_jobs"
    job_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    project_id = Column(String, nullable=True, index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    # pending | running | completed | failed | cancelled
    stage = Column(String, nullable=True)   # contracts|backend|frontend|qa|devops|docs
    model = Column(String, nullable=True)
    error = Column(Text, nullable=True)
    result_path = Column(String, nullable=True)  # caminho do artefato no object storage
    input_tokens_total = Column(Integer, nullable=False, default=0)
    output_tokens_total = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False)
    started_at = Column(String, nullable=True)
    completed_at = Column(String, nullable=True)
    updated_at = Column(String, nullable=False)
```

#### Impacto em `apps/api/app/repositories/modernize_job_repository.py`
- Substituir lógica in-memory por queries SQLAlchemy neste modelo
- Remover `initialize()` (Alembic cria a tabela)
- Remover chamada `modernize._jobs_repo.initialize()` de `main.py:lifespan`

#### Token tracking — adicionar ao fluxo da pipeline

Em `apps/api/app/engines/factory_pipeline.py`, após `response = router.route(...)`:
```python
if response and response.usage:
    # acumular em job record no banco
    job_repo.add_usage(
        job_id=current_job_id,
        input_tokens=response.usage.get("input_tokens", 0),
        output_tokens=response.usage.get("output_tokens", 0),
    )
```

---

### Etapa B5 — Limit de gerações simultâneas por usuário
**Risco:** 🟢 | **Estimativa:** 4 horas | **Prioridade:** P1

**Arquivo:** `apps/api/app/routes/meta_factory.py` — adicionar no início de cada endpoint de geração:

```python
def _check_generation_quota(user_id: str) -> None:
    settings = get_settings()
    active = generation_job_engine.count_active_for_user(user_id)
    if active >= settings.max_concurrent_generations_per_user:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "generation_quota_exceeded",
                "message": f"Você já tem {active} geração(ões) em execução. Aguarde a conclusão antes de iniciar outra.",
            },
        )
```

**`apps/api/app/core/config.py`** — adicionar:
```python
max_concurrent_generations_per_user: int = Field(
    default_factory=lambda: int(os.environ.get("LDCN_MAX_CONCURRENT_GEN", "2"))
)
```

---

### Etapa B6 — SameSite no refresh cookie + CORS fail-fast em produção
**Risco:** 🟢 | **Estimativa:** 2 horas | **Prioridade:** P1

**`apps/api/app/routes/auth.py`** — localizar `response.set_cookie(...)` e adicionar `samesite="strict"`:
```python
response.set_cookie(
    key=settings.refresh_cookie_name,
    value=refresh_token,
    httponly=True,
    secure=settings.refresh_cookie_secure,
    samesite="strict",     # ← ADICIONAR
    max_age=settings.refresh_token_expire_days * 86400,
    path="/api/auth",      # escopo mínimo
)
```

**`apps/api/app/core/config.py`** — tornar CORS explícito em produção:
```python
def _default_allowed_origins() -> list[str]:
    raw = os.environ.get("LDCN_ALLOWED_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    if os.environ.get("LDCN_ENVIRONMENT", "local") == "production":
        raise RuntimeError(
            "LDCN_ALLOWED_ORIGINS é obrigatório em produção. "
            "Exemplo: LDCN_ALLOWED_ORIGINS=https://app.ldcn.io"
        )
    return list(_DEV_DEFAULT_ORIGINS)
```

---

### Etapa B7 — Paginação nos endpoints de listagem
**Risco:** 🟢 | **Estimativa:** 1 dia | **Prioridade:** P1

**Schema reutilizável** — criar `apps/api/app/schemas/pagination.py`:
```python
from __future__ import annotations
from typing import Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
    has_more: bool = Field(default=False)

    @classmethod
    def of(cls, items: list[T], total: int, limit: int, offset: int):
        return cls(items=items, total=total, limit=limit, offset=offset, has_more=offset + limit < total)
```

**Aplicar em** (endpoints prioritários):
- `GET /api/projects` → `apps/api/app/routes/projects.py`
- `GET /api/project-rooms` → `apps/api/app/routes/project_rooms.py`
- `GET /api/analytics/overview` (sections com listas)
- `GET /api/templates`
- `GET /api/skills`

```python
# Exemplo em projects.py
@router.get("/projects", response_model=PaginatedResponse[ProjectSummary])
def list_projects(
    user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PaginatedResponse[ProjectSummary]:
    all_items = service.list_for_user(user["user_id"])
    page = all_items[offset : offset + limit]
    return PaginatedResponse.of(page, total=len(all_items), limit=limit, offset=offset)
```

---

### Etapa B8 — Versionamento de API (/v1/)
**Risco:** 🟡 (breaking change) | **Estimativa:** 1 dia | **Prioridade:** P1

**`apps/api/app/core/config.py`**:
```python
api_prefix: str = "/api/v1"
```

Adicionar redirect de compatibilidade para não quebrar integrações existentes:

**`apps/api/app/main.py`** — após registrar rotas v1:
```python
from fastapi.responses import RedirectResponse

@app.api_route("/api/{path:path}", methods=["GET","POST","PATCH","PUT","DELETE","OPTIONS"])
async def legacy_redirect(path: str, request: Request):
    """Redireciona /api/* para /api/v1/* por 90 dias durante período de transição."""
    return RedirectResponse(url=f"/api/v1/{path}", status_code=308)
```

---

### Etapa B9 — Analytics: índices e cache
**Risco:** 🟢 | **Estimativa:** 4 horas | **Prioridade:** P2

**Migration Alembic** — adicionar índices faltantes:
```python
# alembic/versions/xxxx_add_analytics_indexes.py
def upgrade():
    op.create_index("idx_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("idx_audit_logs_event_code", "audit_logs", ["event_code"])
    op.create_index("idx_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])
```

**`apps/api/app/services/analytics_service.py`** — adicionar cache de 60s:
```python
import time

_cache: dict[str, tuple[float, object]] = {}
_CACHE_TTL = 60.0

def _cache_key(user_id: str, filters) -> str:
    return f"{user_id}:{hash(str(filters))}"

class AnalyticsService:
    def overview(self, user_id: str, filters) -> AnalyticsOverviewResponse:
        key = _cache_key(user_id, filters)
        if key in _cache:
            ts, data = _cache[key]
            if time.monotonic() - ts < _CACHE_TTL:
                return data
        result = self._compute_overview(user_id, filters)
        _cache[key] = (time.monotonic(), result)
        return result
```

---

### Etapa B10 — SSE: backpressure e reconexão com Last-Event-ID
**Risco:** 🟡 | **Estimativa:** 2 dias | **Prioridade:** P1

**`apps/api/app/routes/meta_factory.py`** — no endpoint SSE de geração:
```python
@router.get("/meta-factory/generate/stream/{job_id}")
async def stream_generation(job_id: str, request: Request, user: CurrentUser):
    last_event_id = int(request.headers.get("Last-Event-ID", "0"))

    async def event_generator():
        event_seq = 0
        async for event in generation_job_engine.stream(job_id, from_seq=last_event_id):
            if await request.is_disconnected():
                await generation_job_engine.cancel(job_id)
                return
            event_seq += 1
            data = json.dumps(event)
            yield f"id: {event_seq}\ndata: {data}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
```

A engine de jobs deve persistir os últimos N eventos por `job_id` para habilitar o replay quando `from_seq > 0`.

---

## FRONTEND

---

### Etapa F1 — Planning Center (criar módulo completo)
**Risco:** 🟢 | **Estimativa:** 3 dias | **Prioridade:** P1

**Por que primeiro:** É o único módulo listado na sidebar que não existe. Qualquer demo com cliente descobre na hora.

#### Estrutura a criar

```
apps/web/app/(app)/planning/
  page.tsx                          # página principal
apps/web/components/planning/
  planning-kanban.tsx               # board de etapas
  planning-milestone-card.tsx       # card de milestone
  planning-progress-timeline.tsx    # linha do tempo
apps/web/lib/api/
  planning.ts                       # client HTTP (pode usar dados do project_rooms)
apps/web/hooks/
  use-planning.ts
```

#### Backend necessário (mínimo)
O Planning Center pode ser construído inicialmente como uma **view derivada** do que já existe — sem novo endpoint:
- Listar project rooms com status
- Calcular progresso pelo status atual (IDEATION → READY = 8 etapas)
- Mostrar timeline de quando cada etapa foi concluída (timestamps existem no banco)

**`apps/web/app/(app)/planning/page.tsx`** — estrutura mínima:
```tsx
'use client';

import { useMemo } from 'react';
import { useProjectRooms } from '@/hooks/use-project-rooms';
import { PlanningKanban } from '@/components/planning/planning-kanban';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { useLocale } from '@/hooks/use-locale';

const PIPELINE_STAGES = [
  'IDEATION', 'PROMPT_APPROVED', 'BLUEPRINT_READY',
  'ENGINEERING_REVIEW', 'ENGINEERING_APPROVED',
  'WAITING_META_FACTORY', 'GENERATING', 'READY',
] as const;

export default function PlanningPage() {
  const { t } = useLocale();
  const { data: rooms, isLoading, error } = useProjectRooms();

  const columns = useMemo(() => {
    if (!rooms) return [];
    return PIPELINE_STAGES.map(stage => ({
      stage,
      rooms: rooms.filter(r => r.status === stage),
    }));
  }, [rooms]);

  if (isLoading) return <CardLoading />;
  if (error) return <PageError message={String(error)} />;

  return (
    <div className="flex flex-col gap-6 py-4">
      <header>
        <h1 className="type-h2">{t('planning.title')}</h1>
        <p className="type-body text-[color:var(--muted)]">{t('planning.subtitle')}</p>
      </header>
      <PlanningKanban columns={columns} />
    </div>
  );
}
```

---

### Etapa F2 — Skeleton em todas as páginas (remover `fallback={null}`)
**Risco:** 🟢 | **Estimativa:** 1 dia | **Prioridade:** P2

**Padrão a adotar em TODAS as páginas com Suspense:**

```tsx
// ANTES (atual — meta-factory/page.tsx:51)
<Suspense fallback={null}>

// DEPOIS
<Suspense fallback={<PageSkeleton />}>
```

**Criar componente reutilizável** `apps/web/components/feedback/page-skeleton.tsx`:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  rows?: number;
  showHeader?: boolean;
}

export function PageSkeleton({ rows = 4, showHeader = true }: PageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6 py-4">
      {showHeader && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

**Páginas a corrigir (em ordem de tráfego):**
1. `meta-factory/page.tsx` — `Suspense fallback={null}` → `<PageSkeleton rows={6} />`
2. `auto-fix/page.tsx` — mesma correção
3. `engineering-laboratory/page.tsx`
4. `modernize/page.tsx`
5. `analytics/page.tsx`
6. `documentation/page.tsx`
7. `architect/page.tsx`
8. `engineering-review/page.tsx`

---

### Etapa F3 — Lazy load do Three.js
**Risco:** 🟡 (visual, verificar LDCNCoreBadge em todas as páginas) | **Estimativa:** 4 horas | **Prioridade:** P2

**Todos os componentes em `apps/web/components/three/` e `apps/web/components/ldcn/ldcn-core.tsx` devem ser importados com `dynamic`:**

```tsx
// apps/web/components/three/index.ts — substituir imports diretos por:
import dynamic from 'next/dynamic';

export const LDCNCoreBadge = dynamic(
  () => import('./ldcn-core-badge').then(m => ({ default: m.LDCNCoreBadge })),
  { ssr: false, loading: () => <div className="h-16 w-16 rounded-full bg-[color:var(--surface-secondary)]" /> }
);

export const AmbientBackdrop = dynamic(
  () => import('./ambient-backdrop').then(m => ({ default: m.AmbientBackdrop })),
  { ssr: false, loading: () => null }
);
```

**Verificar `next.config.js`** — garantir que `@react-three/fiber` e `three` estejam no bundle splitting:
```js
// next.config.js
experimental: {
  optimizePackageImports: ['three', '@react-three/fiber', '@react-three/drei'],
}
```

---

### Etapa F4 — Breadcrumb de pipeline de projeto
**Risco:** 🟢 | **Estimativa:** 1 dia | **Prioridade:** P2

**Criar** `apps/web/components/project/pipeline-breadcrumb.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

const STAGES = [
  { label: 'Projeto', href: '/project-rooms' },
  { label: 'PromptMaster', href: null },
  { label: 'Architect', href: '/architect' },
  { label: 'Engineering Review', href: '/engineering-review' },
  { label: 'Meta Factory', href: '/meta-factory' },
  { label: 'Validação', href: null },
  { label: 'Pronto', href: null },
] as const;

interface PipelineBreadcrumbProps {
  currentStage: number;   // 0-based index
  projectId?: string;
}

export function PipelineBreadcrumb({ currentStage, projectId }: PipelineBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-[color:var(--muted)]" aria-label="Pipeline">
      {STAGES.map((stage, i) => (
        <span key={stage.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 opacity-40" />}
          <span className={cn(
            'rounded px-1.5 py-0.5',
            i === currentStage && 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--text)] font-medium',
            i < currentStage && 'text-[color:var(--success)]',
          )}>
            {stage.label}
          </span>
        </span>
      ))}
    </nav>
  );
}
```

**Adicionar no topo de cada página do pipeline** passando o `currentStage` correspondente.

---

### Etapa F5 — Analytics: tratar seções "empty" com estado construtivo
**Risco:** 🟢 | **Estimativa:** 4 horas | **Prioridade:** P1

**Problema:** As seções `documentation` e `laboratory` sempre retornam `status="empty"`, e o frontend mostra `EmptyStatePremium` sem contexto. O cliente vê dois buracos no dashboard.

**Solução no frontend** enquanto o backend não tem dados reais:

```tsx
// apps/web/components/analytics/analytics-components.tsx
// Modificar o render de seções com status="empty":

function AnalyticsSectionCard({ section }: { section: AnalyticsSection }) {
  if (section.status === 'empty') {
    return (
      <Card className="p-6 border-dashed">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-2">
            <Layers3 className="h-4 w-4 text-[color:var(--accent)]" />
          </div>
          <div>
            <p className="type-label font-medium">{section.title}</p>
            <p className="type-body-sm text-[color:var(--muted)] mt-1">
              Os dados serão exibidos aqui após o primeiro uso deste módulo.
            </p>
            {section.id === 'documentation' && (
              <Link href="/documentation" className="type-body-sm text-[color:var(--accent)] hover:underline mt-2 block">
                Abrir Documentation Center →
              </Link>
            )}
            {section.id === 'laboratory' && (
              <Link href="/engineering-laboratory" className="type-body-sm text-[color:var(--accent)] hover:underline mt-2 block">
                Abrir Engineering Lab →
              </Link>
            )}
          </div>
        </div>
      </Card>
    );
  }
  // render normal...
}
```

---

### Etapa F6 — Consistência de empty states globais
**Risco:** 🟢 | **Estimativa:** 4 horas | **Prioridade:** P3

**Auditoria de uso atual:**
```bash
grep -r "EmptyState\|empty-state\|no data\|nenhum\|vazio" apps/web/app --include="*.tsx" -l
```

**Padrão único a adotar** — `EmptyState` de `apps/web/components/empty-states/empty-state.tsx` já existe. Garantir que TODAS as páginas com lista vazia o utilizem:

Páginas a revisar:
- `projects/page.tsx` — sem projetos
- `templates/page.tsx` — sem templates
- `skills/page.tsx` — sem skills
- `project-rooms/page.tsx` — sem rooms
- `documentation/page.tsx` — sem documentos

---

### Etapa F7 — Feedback visual quando geração cai no MockAdapter
**Risco:** 🟢 | **Estimativa:** 2 horas | **Prioridade:** P1

O evento `agent_finished` da SSE já tem `degraded: boolean`. O frontend precisa mostrar um banner quando qualquer agente foi servido por fallback.

**`apps/web/app/(app)/meta-factory/page.tsx`** — localizar o handler do evento `agent_finished` e adicionar:

```tsx
case 'agent_finished': {
  if (event.degraded) {
    setDegradedAgents(prev => [...prev, event.role]);
  }
  // handler atual...
  break;
}

// No render:
{degradedAgents.length > 0 && (
  <div className="rounded-lg border border-[color:var(--warning)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 text-[color:var(--warning)] mt-0.5 shrink-0" />
      <div>
        <p className="type-label font-medium text-[color:var(--warning)]">Geração em modo determinístico</p>
        <p className="type-body-sm text-[color:var(--muted)] mt-0.5">
          Os agentes {degradedAgents.join(', ')} usaram templates porque o provedor de IA não estava disponível.
          Configure uma chave de API para geração com IA real.
        </p>
      </div>
    </div>
  </div>
)}
```

---

### Etapa F8 — API versionamento no cliente HTTP
**Risco:** 🟡 (coordenar com Etapa B8) | **Estimativa:** 2 horas | **Prioridade:** P1

Quando o backend mudar para `/api/v1/`, o frontend precisa seguir. Centralizar o base URL:

**`apps/web/lib/api/client.ts`** (ou arquivo equivalente de base URL):
```typescript
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
export const API_V1 = `${API_BASE}/api/v1`;

// todos os clients HTTP devem usar API_V1, não hardcodar '/api/'
```

Buscar e substituir nos clients:
```bash
grep -r '"/api/' apps/web/lib/api --include="*.ts" -l
```

---

## SEQUÊNCIA DE ENTREGA RECOMENDADA

```
Semana 1
├── B1 PostgreSQL + Alembic         (3 dias)
└── B6 SameSite + CORS fail-fast    (0.5 dia)

Semana 2
├── B2 Redis Rate Limiter           (1 dia)
├── B3 Redis User Vault             (1 dia)
└── B5 Limit de gerações simultâneas (0.5 dia)

Semana 3
├── B4 Jobs persistidos + token tracking  (2 dias)
└── B9 Analytics: índices + cache         (0.5 dia)

Semana 4
├── F1 Planning Center              (3 dias)
└── F7 Feedback degraded/mock       (0.5 dia)

Semana 5
├── F2 Skeleton em todas as páginas (1 dia)
├── F3 Three.js lazy load           (0.5 dia)
└── F5 Analytics empty states       (0.5 dia)

Semana 6
├── B7 Paginação em list endpoints  (1 dia)
├── B8 Versionamento /v1/           (1 dia)
└── F4 Breadcrumb de pipeline       (1 dia)

Semana 7
├── B10 SSE backpressure + Last-Event-ID  (2 dias)
├── F6 Empty states consistentes          (0.5 dia)
└── F8 API client versionado              (0.5 dia)
```

---

## CRITÉRIOS DE ACEITE POR ETAPA

| Etapa | Critério mínimo |
|---|---|
| B1 | `pytest` verde com `LDCN_DATABASE_URL=postgresql://...` e `alembic upgrade head` sem erro |
| B2 | Rate limiter funciona com 2 instâncias do uvicorn; Redis opcional em dev |
| B3 | User key persiste quando request vai para instância diferente (teste manual ou integration test) |
| B4 | Job visível em `/api/v1/meta-factory/jobs` após restart do servidor |
| B5 | Terceira geração simultânea recebe 429 com mensagem clara |
| B6 | `Set-Cookie` tem `SameSite=Strict`; startup em production sem CORS env → erro claro |
| B7 | `GET /api/v1/projects?limit=5&offset=0` retorna `has_more: true` quando há mais de 5 projetos |
| B8 | `/api/health` → 308 redirect para `/api/v1/health` |
| B9 | `EXPLAIN QUERY PLAN` em `SELECT ... FROM audit_logs WHERE created_at > ?` usa índice |
| B10 | Fechar aba durante geração cancela o LLM call (verificar logs do servidor) |
| F1 | Planning Center aparece na sidebar, mostra boards com rooms agrupados por status |
| F2 | Nenhuma página tem `fallback={null}` no Suspense; skeleton aparece em rede lenta |
| F3 | Lighthouse: FCP < 2s; bundle `three.js` não aparece no critical chunk |
| F4 | Breadcrumb correto em Architect, Engineering Review e Meta Factory |
| F5 | Seções empty de analytics têm CTA para o módulo correspondente |
| F6 | Lista vazia em Projects, Templates, Skills usa o mesmo `EmptyState` component |
| F7 | Ao rodar sem API key, banner amarelo aparece com texto explicativo |
| F8 | Todas as chamadas HTTP usam `API_V1` como base; nenhum `/api/` hardcoded |
