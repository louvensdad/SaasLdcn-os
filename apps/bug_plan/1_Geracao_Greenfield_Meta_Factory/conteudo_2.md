## 1. Wizard → captura a ideia

O usuário descreve o que quer construir (`/wizard`). Aqui nasce uma `ProjectSpec` — a representação estruturada da ideia (entidades, regras de negócio, tipo de sistema).

## 2. Project Room → o "workspace" do projeto

Cada ideia vira uma sala (`/project-rooms`) com um **status stepper**: Descoberta → PromptMaster → Blueprint → Geração. É o hub onde o usuário acompanha o projeto evoluir.

## 3. PromptMaster → spec vira documento técnico

O `prompt_master_engine.py`/`prompt_master_md_engine.py` transforma a spec crua num documento `.md` estruturado — o "contrato" que todos os agentes vão ler depois. **Esse é o ponto mais criticado nos relatórios internos**: sem IA real configurada, esse documento sai quase idêntico entre ideias completamente diferentes (~98% de similaridade, segundo o `founder_recommendation.md`).

## 4. Architect / Blueprint → decide a arquitetura

O `architect_engine.py` + `blueprint_engine.py` pegam o PromptMaster e decidem: qual stack, quais módulos, qual banco, etc. — com justificativa. Isso é o que o pitch do produto chama de "agente arquiteto".

## 5. Meta-Factory → a geração de código de verdade

Aqui mora a complexidade real. O `factory_pipeline.py` roda uma pipeline de agentes em sequência fixa:

```
contracts → backend → frontend → (mobile, se aplicável) → qa → devops → docs
```

Cada etapa é **uma chamada bloqueante a um LLM**, rodando em thread separada, com heartbeat a cada 8s só pra manter o SSE vivo (é o único sinal de "o backend não travou" que a UI tem durante minutos de geração) e timeout de 6 min por agente pra nunca travar a pipeline inteira.

O `generation_job_engine.py` (2280 linhas) é quem orquestra tudo isso e aciona, a cada etapa, uma bateria de verificações antes de deixar avançar:

- `functional_completeness_engine` / `functional_coverage_engine` — o código gerado cobre o que foi prometido?
- `ground_truth_engine` / `execution_reality_guard` — nada de resultado "fake" passando como real
- `quality_gate_engine` — bloqueia a etapa se algo crítico falhar
- `project_memory_engine` — lembra decisões/correções entre gerações do mesmo projeto
- `work_estimation_engine` — estima o tamanho do trabalho antes de começar (política "sem pressa")
- `metering_engine` — registra consumo de tokens (alimenta o billing da Área 5)

> **Correção aplicada (Achado 1 da auditoria de segurança):** `ProjectWriter.append()` — usado a cada estágio dessa pipeline pra gravar os arquivos emitidos por cada agente — escrevia qualquer arquivo em disco sem checar se ele já existia nem se pertencia ao território de outro agente. Isso permitia que um estágio posterior (ex: `docs`) sobrescrevesse silenciosamente um arquivo que um estágio anterior (ex: `qa`) já tinha escrito e validado (ex: `docs/security_review.md`), ou pior, plantasse/alterasse `.github/workflows/*.yml` (território do `devops`), o que executaria no CI do próprio usuário após o export do projeto pro GitHub. A correção (`apps/api/app/services/project_writer.py` + `apps/api/app/routes/meta_factory.py`) faz `append()` recusar a sobrescrita quando o `agent_role` que está escrevendo não tem território sobre um arquivo **já existente**, propagando o erro pro `stage_errors` que já interrompe a geração — arquivos novos continuam livres, sem regressão na tolerância a layouts idiomáticos.

## 6. Handoff → entrega final

`generation_handoff_engine.py` empacota o resultado: README, docs, ZIP seguro (nunca a raiz do LDCN OS, nunca segredos).
