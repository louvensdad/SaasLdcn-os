# LDCN Execution Terminal — intervenção humana real por projeto

Data: 2026-07-04 · Branch: feat/premium-foundation

## Problema

O pipeline de build/instalação falhava sem possibilidade de intervenção humana:
o único caminho era o auto-fix da IA. Não existia terminal de execução dentro do
sistema para debug real do workspace gerado.

## Implementação

### Backend (`app/services/execution_terminal_service.py`)

Terminal de execução por projeto, confinado ao workspace gerado:

- **Contexto do projeto ativo**: `cwd` relativo à raiz do projeto gerado, com
  seletor para `apps/web`, `apps/api`, `apps/mobile`; qualquer caminho que
  resolva fora da raiz é rejeitado. O próprio projeto tem de estar SOB
  `generated-projects/active` — nunca um diretório do host.
- **Allowlist de comandos** (shell=False, tokenização shlex, metacaracteres de
  shell `| & ; > < ` $` rejeitados):
  - `npm` install/ci/run/test/exec/ls/audit/view/outdated (`npm run <script>`
    liberado por design — scripts do projeto são o objetivo);
  - `git` somente leitura (status/log/diff/branch/show/remote);
  - `node <script>` apenas com script existente DENTRO do projeto
    (`-e/--eval/-p` proibidos);
  - `npx` restrito a tsc/eslint/vitest/jest/prettier/next.
- **Logs em tempo real**: stdout/stderr bombeados linha a linha (mesmo padrão do
  build validation) e **sanitizados** (redação de secret/token/password/api-key)
  antes de stream/persistência. Timeout de 300s com kill.
- **Histórico persistente**: cada execução (inclusive rejeições — trilha de
  auditoria de tentativas) vira um `TerminalCommandRecord` durável em
  `generated-projects/terminal-sessions/<project>.json` (cap 200), com comando,
  cwd, exit code, duração, tails, executor e origem (user/ai_suggestion).
- **Rotas** (ownership via `_owned_meta_project` + audit log
  `terminal_command_executed`):
  - `POST /meta-factory/{id}/terminal/execute` — SSE (`line*` → `done` com o
    registro);
  - `GET /meta-factory/{id}/terminal/history` — histórico + allowlist.

### Modo híbrido AI + Terminal

A IA já é limitada (2 auto-reparos, `MAX_ATTEMPTS_PER_PHASE=3` — nunca loop
infinito); quando desiste, o build vira `SKIPPED_AFTER_FAILURE` e o frontend
**abre o terminal automaticamente** para a intervenção humana imediata.

### Frontend (`components/generation/execution-terminal.tsx`)

- Botão **"Abrir Terminal"** no cabeçalho da pipeline; painel **lado a lado**
  com o console de execução (grid 2 colunas).
- Input de comando + quick commands (npm install / run build / run test /
  run lint / git status), seletor de diretório, saída streaming com cores
  stdout/stderr, **histórico de comandos** (clicável para reutilizar).
- **"Aplicar sugestão da IA"**: executa sequencialmente os comandos do
  `ManualBuildFixGuide` do build pulado.
- **"Reexecutar build"**: reativa a etapa de build do job
  (`retryJobStage('build')`) — o pipeline continua após a correção manual.
- i18n nos 4 idiomas.

## Testes (`tests/test_execution_terminal.py`, 13)

- segurança: comandos fora da allowlist rejeitados (rm/curl/powershell/python),
  metacaracteres de shell rejeitados, cwd confinado, projeto fora do workspace
  gerado recusado, `node -e` proibido e script fantasma recusado, secrets
  redigidos na saída;
- **execução manual real**: `npm install` de verdade num projeto mínimo
  (exit 0, lockfile criado) e `git status` com saída real;
- **logs persistentes**: histórico sobrevive a nova instância do serviço;
- **IA não entra em loop**: política de auto-reparo comprovadamente limitada;
- **pipeline continua após correção manual**: build SKIPPED → comando no
  terminal (auditado) → `retry_stage('build')` aceito (buildStatus volta a
  PENDING, retry contado);
- rotas com ownership + histórico persistido via API.

## Critério de aceitação

- Nenhum build fica travado sem ação humana: auto-repair limitado → terminal
  abre automaticamente com guia + comandos sugeridos.
- O usuário sempre pode intervir: terminal disponível para qualquer projeto
  gerado, a qualquer momento ("Abrir Terminal").
- O sistema nunca depende só do auto-fix: correção manual + reativação da
  etapa de build são caminhos de primeira classe, auditados.
