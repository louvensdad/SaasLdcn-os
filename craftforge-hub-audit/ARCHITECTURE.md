# Arquitetura do Sistema

## Visão Geral de Camadas

O sistema segue uma arquitetura de **monólito modular**, com domínios separados em pacotes (`app/user`, `app/account`, `app/instance`, `app/macro`, `app/execution_log`). A comunicação interna entre módulos ocorre por meio de serviços (application layer) e dependências injetadas via interfaces (ports).

```
┌──────────────────────────────────────────────────────────────────┐
│                        Cliente (React/Vite)                      │
│  HTTP REST (CRUD) + WebSocket (status em tempo real)             │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│                    FastAPI (app/main.py)                         │
│  - Middleware (CORS, autenticação, rate limit)                    │
│  - Roteadores por domínio (app/user, app/account, ...)           │
│  - WebSocket endpoint (websocket_endpoint)                       │
└───────────────────────────────┬──────────────────────────────────┘
                                │
    ┌───────────────────────────┼───────────────────────────────┐
    │                           │                               │
    ▼                           ▼                               ▼
┌──────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ app/user     │   │ app/account          │   │ app/instance         │
│ - models     │   │ - models             │   │ - models             │
│ - schemas    │   │ - schemas            │   │ - schemas            │
│ - application│   │ - application        │   │ - application        │
│   - service  │   │   - port (interface) │   │   - service          │
│ - router     │   │   - account_service  │   │ - router             │
│              │   │ - router             │   │                      │
└──────────────┘   └──────────────────────┘   └──────────────────────┘
┌──────────────────────┐   ┌─────────────────────────────────────────┐
│ app/macro            │   │ app/execution_log                       │
│ - models             │   │ - models                                │
│ - schemas            │   │ - schemas                               │
│ - application        │   │ - application                           │
│   - service          │   │   - service                             │
│ - router             │   │ - router                                │
└──────────────────────┘   └─────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                          Core Layer                              │
│  app/core/config.py     – Configurações (pydantic-settings)      │
│  app/core/security.py   – JWT, hash de senhas                    │
│  app/core/deps.py       – Dependências (get_current_user, etc.)  │
│  app/core/rate_limit.py – Rate limiting                           │
│  app/db/base.py         – Base declarativa SQLAlchemy            │
│  app/db/session.py      – Sessão assíncrona                       │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                      PostgreSQL 16 (asyncpg)                     │
│  Tabelas: users, accounts, instances, macros, execution_logs     │
└──────────────────────────────────────────────────────────────────┘
```

## Fluxo de Request → Use Case → Resposta

### Exemplo: Iniciar Instância

1. **Cliente** envia requisição `POST /instances/{instance_id}/start` com token JWT no header `Authorization: Bearer <token>`.

2. **FastAPI router** (`app/instance/router.py`) valida o token via dependência `Depends(get_current_user)` (definida em `app/core/deps.py`). Obtém o usuário autenticado e seu plano.

3. **Use case / Application Service** (`app/instance/application/instance_service.py`):
   - Verifica se a instância pertence ao usuário.
   - Verifica se o limite de instâncias simultâneas do plano não foi atingido.
   - Obtém a instância do banco com `SELECT ... FOR UPDATE` para evitar race condition.
   - Altera o estado para "online".
   - Persiste a mudança no banco.
   - Registra log de execução (opcional).

4. **Resposta**: O endpoint retorna `InstanceResponse` com status atualizado (HTTP 200). Em caso de erro (instância já ativa, limite excedido), retorna erro 4xx com `ErrorResponse`.

### Exemplo: WebSocket de Monitoramento

1. **Cliente** conecta ao endpoint `ws://host:8000/ws` com token JWT como query parameter.
2. **FastAPI** aceita a conexão e autentica o usuário.
3. O servidor mantém a conexão aberta. Sempre que o status de uma instância muda (via outro endpoint ou agente externo), o servidor envia uma mensagem JSON com os novos dados (status, FPS, RAM).
4. O cliente React (utilizando `useWebSocket` hook) atualiza o painel em tempo real.

## Módulos e Responsabilidades

### `app/auth` (Autenticação)
- `router.py`: endpoints `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/me`
- `application/auth_service.py`: lógica de criação de usuário, verificação de senha, geração de tokens JWT
- `schemas.py`: Pydantic models para requisição/resposta

### `app/account` (Contas de Jogo)
- `router.py`: CRUD de contas (`/accounts`)
- `application/account_service.py`: validação de credenciais (simulada), criação de instância associada

### `app/instance` (Instâncias)
- `router.py`: endpoints de instância (`/instances`, `/instances/{id}/start`, `/instances/{id}/stop`)
- `application/instance_service.py`: lógica de inicialização/parada, verificação de limite, alteração de estado

### `app/macro` (Macros)
- `router.py`: CRUD de macros (`/macros`), associação (`/macros/{id}/associate`), execução (`/macros/{id}/execute`)
- `application/macro_service.py`: execução da macro (simulada), registro de log de execução

### `app/execution_log` (Logs de Execução)
- `router.py`: consulta de logs (`/logs`, `/logs/{id}`)
- `application/execution_log_service.py`: filtros, paginação

### `app/core`
- `config.py`: carrega variáveis de ambiente via `pydantic-settings`
- `security.py`: funções `create_access_token`, `verify_password`, `get_password_hash` (bcrypt)
- `deps.py`: dependências injetáveis (`get_current_user`, `get_admin_user`, `get_db`)
- `rate_limit.py`: implementação simples de rate limiting (em memória ou via Redis, opcional)

### `app/db`
- `base.py`: `Base = declarative_base()` comum a todos os modelos
- `session.py`: `async_session` factory e `get_db` generator

## Segurança

- JWT com tokens de acesso (30 min) e refresh (7 dias).
- Senhas hashadas com bcrypt (custo 12).
- Controle de acesso por role: endpoints `admin/` exigem role `admin`.
- Todos os endpoints de instância, macro, conta verificam propriedade do recurso (somente o dono ou admin pode modificar).
- Rate limiting por IP (configurável) em endpoints críticos de autenticação.

## Observabilidade

- Logs estruturados via `loguru` (configurado em `app/core/logging.py` – não incluído nesta versão).
- Métricas Prometheus em `/metrics` (planejado).
- Sentry para rastreamento de erros (configuração futura).

## Testes

- **Unitários**: testam services com dependências mockadas (banco em memória ou patches).
- **Integração**: testam endpoints com banco PostgreSQL real (usando fixtures pytest-asyncio e testcontainers).
- **Coverage mínima**: 80%.

Consulte `docs/traceability.md` para a relação completa entre requisitos e artefatos.