# Engineering Review — Comitê de Engenharia, Dimensões e Parecer

## Comitê de especialistas (votação)

`apps/api/app/engines/engineering_review_engine.py::_committee` produz votos de
7 papéis — **Architect, Security, Performance, QA, DevOps, Documentation, AI Reviewer** —
cada um com `rating` (0–5★), `verdict` (`approved` / `approved_with_caveats` /
`changes_requested`), `rationale` e `signals`. Tudo derivado de sinais reais
(ex.: Security do par auth+authorization; QA da cobertura de testes). O **AI Reviewer**
é honesto quando o blueprint é determinístico: "sugere regenerar com IA".

## Dimensões

`_dimensions`: Segurança, Escalabilidade, Performance, **Custos**, Documentação,
Qualidade. Cada uma traz `score` **ou** `unavailable` honesto + `verdict` + `findings`.
Custos é tratado como **banda qualitativa** (sem score numérico/monetário): a UI
mostra "sem score" e "Banda qualitativa geral: <X> (não monetária)".

## Parecer final (`final_opinion`)

`_final_opinion`: probabilidade de sucesso da 1ª geração (score geral − penalidade por
perguntas em aberto, ou `null` quando não derivável), bandas de Complexidade / Risco /
Escalabilidade, narrativa e **disclaimer**. `deterministic=true` quando não há LLM, com
o aviso explícito: "produzido pelo modo determinístico (sem LLM) e possui profundidade
reduzida".

## Distinção do Architect

A Review **não repete** o Architect: o Comitê faz a leitura crítica (decisões sólidas,
discutíveis, riscos, lacunas, inconsistências, impactos, recomendações) e vota; o
Architect decide e justifica. São abas e componentes distintos.

## UI premium (abas)

`engineering-review/page.tsx`: **Resumo · Comitê · Dimensões · Readiness · Parecer**.
A orquestração crítica `approveAndSend` (validar → confirmar preview → aprovar → enviar)
e o **Readiness Center** vivem na aba Readiness, preservando o fluxo do turno anterior.

## Validação

`tsc` limpo · build (/engineering-review 11.2 kB) · `test_project_rooms.py`
(committee/dimensions/parecer) verde · Playwright: votos, score, dimensões/custo,
parecer determinístico (5 testes novos).
