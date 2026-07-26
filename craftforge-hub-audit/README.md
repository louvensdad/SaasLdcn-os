# SaaS Multi-Login - Painel de Controle de Contas de Jogo

## Visão Geral

Sistema SaaS para gerenciamento centralizado de múltiplas contas e instâncias de um jogo. Oferece painel com monitoramento em tempo real (status online/offline, FPS, RAM), inicialização em lote, e execução de macros/scripts de automação por conta. Desenvolvido como monólito modular com backend em FastAPI e frontend em React.

## Stack Tecnológica

### Backend
- **FastAPI 0.140.0** (Python 3.12): framework web assíncrono com suporte nativo a WebSocket, validação via Pydantic e documentação OpenAPI automática. Escolhido por atender aos requisitos de monitoramento em tempo real e operações assíncronas (inicialização em lote).
- **SQLAlchemy async + asyncpg**: driver assíncrono para PostgreSQL, permitindo operações não bloqueantes e suporte a `SELECT ... FOR UPDATE` para garantir que uma instância não seja iniciada duas vezes.
- **Alembic**: migrações de banco de dados.
- **JWT (OAuth2 password flow)**: autenticação stateless com tokens de acesso curtos e refresh tokens longos. Senhas hashadas com bcrypt (sem passlib para evitar incompatibilidades).
- **RBAC**: controle de acesso baseado em papéis (user/admin) com limite de instâncias por plano do usuário.

### Frontend
- **React + TypeScript + Vite**: construção de SPA com hot module replacement rápido. Integração com WebSocket para atualizações em tempo real.
- **i18n (next-intl)**: internacionalização com dicionários pt-BR e en-US.

### Infraestrutura
- **PostgreSQL 16**: banco relacional com suporte a JSONB para logs de execução de macros.
- **Docker** (em preparação): conteinerização para ambiente consistente.
- **Agente externo (arquitetura planejada)**: plugin JSON-RPC sobre WebSocket para comunicação com o cliente do jogo (monitoramento de processos e injeção de macros).

## Pré-requisitos

- Python 3.12
- Node.js 20+ (para frontend)
- PostgreSQL 16 (local ou Docker)
- pip e npm

## Como Rodar Localmente

### 1. Backend (modo real)

```bash
# Instalar dependências
pip install -r requirements.txt

# Configurar variáveis de ambiente (copie .env.example para .env)
cp .env.example .env
# Edite .env com sua string de conexão do PostgreSQL

# Executar migrações
alembic upgrade head

# Iniciar servidor de desenvolvimento
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

O servidor estará disponível em `http://localhost:8000`. Documentação interativa: `http://localhost:8000/docs`.

### 2. Backend (modo mock)

Para desenvolvimento sem banco de dados, utilize dados mockados nos testes ou um banco SQLite em memória (não implementado atualmente). Os testes de integração utilizam um banco PostgreSQL configurado via `pytest` com fixtures apropriadas.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend será servido em `http://localhost:5173`. Para apontar para o backend local, configure `VITE_API_BASE_URL` no arquivo `frontend/.env`.

### 4. Stack completa com Docker (não disponível)

O Docker Compose ainda não está configurado. Para executar a stack completa, inicie o PostgreSQL manualmente e siga os passos acima.

## Como Rodar Testes

### Backend

```bash
# Instalar dependências de desenvolvimento
pip install -r requirements-dev.txt

# Rodar todos os testes
pytest tests/

# Com cobertura
pytest --cov=app tests/
```

Os testes incluem:
- **Unitários**: `tests/unit/test_user_service.py`, `tests/unit/test_account_service.py`, `tests/unit/test_instance_service.py`, `tests/unit/test_macro_service.py`, `tests/unit/test_execution_log_service.py`
- **Integração**: `tests/integration/test_auth_endpoints.py`, `tests/integration/test_account_endpoints.py`, `tests/integration/test_instance_endpoints.py`, `tests/integration/test_macro_endpoints.py`, `tests/integration/test_execution_log_endpoints.py`, `tests/integration/test_admin_endpoints.py`, `tests/integration/test_security.py`
- **Conftest**: `tests/conftest.py` (fixtures de banco, cliente de teste, etc.)

### Frontend (comandos de exemplo - a confirmar)

```bash
cd frontend
npm test
```

## Endpoints Principais

### Autenticação
- `POST /auth/register` – Registrar novo usuário
- `POST /auth/login` – Login (retorna tokens JWT)
- `POST /auth/refresh` – Renovar token de acesso
- `GET /auth/me` – Dados do usuário autenticado

### Contas
- `GET /accounts` – Listar contas do usuário
- `POST /accounts` – Adicionar nova conta
- `GET /accounts/{account_id}` – Detalhes da conta
- `PUT /accounts/{account_id}` – Atualizar conta
- `DELETE /accounts/{account_id}` – Remover conta

### Instâncias
- `GET /instances` – Listar instâncias do usuário
- `POST /instances/start` – Iniciar todas as instâncias
- `POST /instances/{instance_id}/start` – Iniciar instância específica
- `POST /instances/{instance_id}/stop` – Parar instância
- `GET /instances/{instance_id}` – Detalhes da instância (status online/offline, FPS, RAM)

### Macros
- `GET /macros` – Listar macros
- `POST /macros` – Criar macro
- `GET /macros/{macro_id}` – Detalhes da macro
- `PUT /macros/{macro_id}` – Atualizar macro
- `DELETE /macros/{macro_id}` – Remover macro
- `POST /macros/{macro_id}/associate` – Associar macro a uma ou mais contas
- `POST /macros/{macro_id}/execute` – Executar macro

### Logs
- `GET /logs` – Listar logs de execução
- `GET /logs/{log_id}` – Detalhes do log

### Administração
- `GET /admin/users` – Listar todos os usuários
- `GET /admin/users/{user_id}` – Detalhes de usuário (admin)

Mais detalhes em [ARCHITECTURE.md](ARCHITECTURE.md) e na documentação OpenAPI (`/docs`).

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória | Padrão |
|----------|-----------|-------------|--------|
| `DATABASE_URL` | String de conexão PostgreSQL (ex: `postgresql+asyncpg://user:pass@localhost:5432/dbname`) | Sim | - |
| `SECRET_KEY` | Chave secreta para JWT (mínimo 32 caracteres) | Sim | - |
| `JWT_ALGORITHM` | Algoritmo de assinatura JWT | Não | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Minutos até expiração do token de acesso | Não | `30` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Dias até expiração do refresh token | Não | `7` |
| `MAX_INSTANCES_USER` | Limite de instâncias para plano padrão | Não | `5` |
| `MAX_INSTANCES_ADMIN` | Limite de instâncias para administradores | Não | `50` |
| `LOG_LEVEL` | Nível de logging (DEBUG, INFO, WARNING, ERROR) | Não | `INFO` |
| `CORS_ORIGINS` | Origens permitidas para CORS (separadas por vírgula) | Não | `http://localhost:5173` |

## Relatório de Execução

Estado atual do projeto: código fonte gerado (297 arquivos válidos), **não buildado**, **não testado**, **Docker não pronto**.

### Comandos de Instalação e Build
- **Pacotes Python**: `pip install -r requirements.txt` (instala FastAPI, SQLAlchemy, asyncpg, bcrypt, etc.)
- **Pacotes de desenvolvimento**: `pip install -r requirements-dev.txt` (pytest, pytest-asyncio, ruff, mypy, etc.)
- **Migrações**: `alembic upgrade head` (cria tabelas no PostgreSQL)
- **Frontend**: `cd frontend && npm install && npm run dev`

### Comandos de Execução Local
- **Backend (real)**: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend (real)**: `cd frontend && npm run dev`
- **Testes**: `pytest tests/` (backend) ou `cd frontend && npm test` (frontend)

### Limitações Conhecidas
- Docker compose não configurado – a stack completa (backend + frontend + banco) não pode ser iniciada com um único comando.
- Nenhum dado mockado para desenvolvimento offline; é necessário um PostgreSQL rodando.
- O build do frontend para produção não foi testado (falta configuração de Docker/nginx).
- Testes não foram executados – o código pode conter erros não detectados.
- A integração com o agente externo (JSON-RPC sobre WebSocket) está apenas planejada, não implementada.

### Validações que Passaram
- Estrutura de diretórios e módulos conforme especificação: `app/user`, `app/account`, `app/instance`, `app/macro`, `app/execution_log`.
- Modelos SQLAlchemy definidos com relacionamentos e constraints.
- Rotas REST implementadas para todos os endpoints listados no contrato OpenAPI.
- Testes de unidade e integração escritos (não executados).
- Configuração de autenticação JWT com bcrypt.
- Documentação gerada (README, ARCHITECTURE, traceability, security review).
- Coleção Postman para testes de API.

## Matriz de Rastreabilidade (Resumida)

| Requisito / Regra de Negócio | Artefatos |
|------------------------------|-----------|
| Cada conta vira uma instância isolada | `app/account/models.py`, `app/instance/models.py`, serviços de account e instance |
| Limite de instâncias por plano | `app/core/deps.py`, `app/instance/application/instance_service.py` (verificação em `start_instance`) |
| Instância não pode ser iniciada duas vezes | `app/instance/application/instance_service.py` (lógica de estado), integração DB com `SELECT FOR UPDATE` |
| Execução de macro registrada em log | `app/execution_log/models.py`, `app/macro/application/macro_service.py` (registro de log) |
| Autenticação OAuth2 JWT | `app/auth/router.py`, `app/core/security.py` |
| Monitoramento em tempo real (WebSocket) | `app/main.py` (rota WebSocket), frontend com `useWebSocket` hook |
| CRUD de contas, instâncias, macros, logs | Rotas REST em `app/account/router.py`, `app/instance/router.py`, `app/macro/router.py`, `app/execution_log/router.py` |
| Administração de usuários | `app/user/router.py` (endpoints admin) |

Consulte `docs/traceability.md` para a matriz completa.

## Licença

Proprietária – todos os direitos reservados.