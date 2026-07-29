# Auditoria de interatividade — Mission Workspace

Data: 2026-07-22  
Rota: `/wizard`

| Elemento | Estado atual | Ação esperada | Handler atual | Correção necessária |
|---|---|---|---|---|
| Oito missões MVP | `button`, seleção local | Selecionar e recomputar toda a mesa | `setSelectedType` local | Mover para Zustand, URL e persistência |
| Demais opções de missão | `button disabled` | Selecionar missão real | Nenhum | Registrar genomes compactos no registry frontend/backend |
| Mission Genome | Leitura derivada do genome | Reagir a missão e modo; expandir/recolher | Nenhum | Derivar métricas do store e adicionar controle de painel |
| Context Engine | Valores mockados (`A definir`, `0`) | Editar objetivo e refletir decisões/contexto | Nenhum | Drawer de objetivo conectado ao estado central |
| Modos de execução | `div` visual | Selecionar modo e recomputar jornada | Nenhum | Radiogroup semântico com setas e persistência |
| Jornada adaptativa | `li` e `span` | Abrir etapa ou explicar bloqueio | Nenhum | Botões por etapa, status, dependências e drawer |
| Especialistas | `span` visual | Ativar/desativar, detalhar e confirmar obrigatórios | Nenhum | Botões toggle e drawer de responsabilidade/impacto |
| Assistência por campo | `span` visual | Validar provider, executar, revisar resultado | Nenhum | Botões reais, gate de IA e estado de loading/erro |
| Detector de riscos | `div` visual | Abrir evidência, severidade e ações | Nenhum | Botões e drawer de detalhes/decisão |
| Entrada de contexto | `span` visual | Abrir editor/upload/URL/schema/projeto | Nenhum | Toggles e modal específico por tipo |
| Artifact Factory | Quatro `article` estáticos | Abrir status, formato e dependências | Nenhum | Artefatos do genome em botões e drawer |
| Botão principal | `Link` direto | Validar contexto/API, criar missão e navegar | Navegação sem validação | Ação assíncrona no store com feedback e erros específicos |
| Painéis | Sempre expandidos | Recolher/expandir/focar | Nenhum | Preferências persistidas por painel |
| URL | Não reflete seleção | Deep link e histórico | Nenhum | `?type=` + `replace/pushState` |
| Refresh | Volta para software.build | Restaurar rascunho | Nenhum | Zustand persist/localStorage versionado |
| Feedback | Somente estados visuais de hover | Loading/sucesso/erro inline | Parcial no store de missão criada | Status global de pré-missão e região `aria-live` |

## Código reutilizável

- `missionStore.ts`: criação real, autosave, IA, decisões, riscos e artefatos após criação.
- `MissionEngine` e `ContextEngine`: jornada, dependências, impactos e interpolação.
- `useActiveLlm` e `LlmConfirmationGate`: fonte de verdade para provider/API key.
- `MissionGenome`: contrato central para steps, especialistas, riscos, entradas e artefatos.
- `missionClient`: API autenticada com normalização backend/frontend.

## Estratégia

Adicionar ao Zustand existente um estado de rascunho do workspace, persistido e versionado. Os componentes de apresentação consomem apenas seletores derivados desse store. O registry permanece responsável pelas definições; componentes não contêm lógica específica de missão.
