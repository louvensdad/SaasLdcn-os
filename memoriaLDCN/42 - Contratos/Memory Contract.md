# Memory Contract

## Objetivo

Padronizar fatos, preferências e decisões usados pela IA.

## Entrada e saída

Entrada: fato, origem, escopo, confiança e retenção. Saída: memória versionada, status, embeddings opcional e trilha de auditoria.

## Autoridade

Memory Engine grava conforme política; usuário pode corrigir ou excluir; Context Engine consome.

## Aceitação

- [ ] Escopo e confiança são obrigatórios.
- [ ] Memória conflitante não substitui outra silenciosamente.
- [ ] Exclusão respeita retenção e auditoria.
