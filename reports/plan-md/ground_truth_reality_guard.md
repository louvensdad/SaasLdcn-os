# Ground Truth State Engine + Execution Reality Guard

Data: 2026-07-03 · Branch: feat/premium-foundation

## Incidente

Após falha de build e pipeline incompleto, um agente respondeu com instruções
de continuidade falsas:

```
git clone https://github.com/medcore-ai/enterprise.git
docker-compose up -d
```

O repositório nunca existiu, o build nunca passou e o pipeline nunca concluiu.
Alucinação de continuidade: o modelo assumiu sucesso que o sistema não confirma.

## Solução

### 1. Ground Truth State Engine (`app/engines/ground_truth_engine.py`)

Estado REAL derivado exclusivamente do registro persistido do job (nunca do que
um modelo disse): `build_status` (SUCCESS/FAILED/NOT_RUN), `pipeline_status` +
etapa, `artifacts_status` (GENERATED/PARTIAL/NOT_GENERATED + contagem),
`repo_status` (sempre NOT_CREATED durante a geração — o export git é ação
posterior do usuário, logo QUALQUER `git clone <url>` gerado é fabricação por
definição), `docker_status` (READY só com build SUCCESS + compose emitido),
`last_failed_step` e `error_trace`.

**Injeção obrigatória**: `prompt_block(state)` entra em TODO contexto de agente
LLM — no pipeline durável (`_run_llm_step`, após a compressão de contexto, para
nunca ser cortado) e no caminho stage-stream (`_stage_context`, estado
pré-pipeline). O bloco é o "STATUS REAL:" do Failure-Aware Prompting:

```
STATUS REAL DO SISTEMA (fonte unica da verdade — NUNCA contradiga):
- BUILD: FAILED
- PIPELINE: NEEDS_USER_ACTION (etapa atual: BUILD_RUNNING)
- ARTIFACTS: PARTIAL (12 arquivo(s) valido(s))
- REPOSITORIO GIT REMOTO: NOT_CREATED
- DOCKER: NOT_READY
- ULTIMO PASSO FALHO: BUILD_RUNNING
- ERRO: npm ERESOLVE dependency conflict
```

### 2. Modo DIAGNOSTIC ONLY

Em estado de falha o bloco ativa `<diagnostic_only_mode>`: permitido explicar o
erro, identificar causa raiz e sugerir correção; proibido assumir projeto
existente, sugerir execução (git clone, docker, deploy, CI/CD) ou "próximos
passos de produção".

### 3. Execution Reality Guard (`app/services/execution_reality_guard.py`)

Valida toda saída do LLM contra o estado real. Regras:

| regra | bloqueia quando |
|---|---|
| `git_clone_without_repo` | `git clone <url>` com `repo_status != CREATED` (sempre, inclusive em arquivos gerados) |
| `docker_without_ready_build` | docker compose/run/build com `docker_status != READY` |
| `deploy_without_ready_pipeline` | kubectl/helm/terraform/vercel/npm publish/deploy-produção com pipeline != READY |
| `invented_success_claim` | "projeto gerado com sucesso", "build passou", "pronto para produção", "successfully built/deployed" quando o estado não confirma |

Dois modos: `response` (orientação ao usuário — conjunto completo) e
`artifact` (arquivos do produto — README pode documentar como rodar o produto
final, mas nunca URLs de clone inventadas nem claims de sucesso; em falha,
o modo diagnóstico endurece também os artefatos).

### 4. Response Validator (fluxo rejeitar → regenerar → forçar diagnóstico)

Em `generation_job_engine._enforce_reality` (roda em toda etapa LLM):

1. valida cada arquivo emitido;
2. violação ⇒ evento `reality_guard` no console vivo + **uma regeneração** com
   `<reality_guard_rejection>` citando exatamente as afirmações rejeitadas;
3. o que ainda violar é **sanitizado**: a linha ofensora vira
   `> [Reality Guard] Instrucao removida (regra): motivo real` e o artefato
   ganha warning advisory (não bloqueia o pipeline — warning policy validada).

## Testes (`tests/test_ground_truth_guard.py`, 10)

- pipeline falhado não gera instruções de deploy (o texto exato do incidente é
  bloqueado e sanitizado);
- `git clone` só passa com repo CREATED (bloqueado também em artifact mode);
- docker-compose só passa com build READY (documentação de produto permitida em
  pipeline saudável, nunca em falha);
- claims de sucesso inventados bloqueados (pt e en), permitidos quando READY real;
- ground truth derivado do job (falha e READY) + bloco de prompt;
- integração `_run_llm_step`: contexto carrega STATUS REAL + DIAGNOSTIC ONLY,
  resposta violadora é regenerada com contexto de falha e o artefato persistido
  sai sanitizado (sem `medcore-ai`, sem `docker-compose up`), com evento
  `reality_guard`; saída limpa passa intocada sem regeneração;
- warnings do guard classificam como advisory (nunca bloqueiam).

## Critério de aceitação

- Nenhuma resposta assume sucesso falso: claims são validados contra o estado
  persistido e removidos com nota honesta.
- Nenhum comando de deploy aparece em pipeline falhado: bloqueado por regra +
  modo diagnóstico + sanitização forçada.
- O sistema sempre reflete o estado real: o estado é injetado em todo contexto
  LLM e é a referência única da validação de saída.
