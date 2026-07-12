# Stack Compatibility Engine — coerência de ecossistema nas dependências geradas

Data: 2026-07-03 · Branch: feat/premium-foundation

## Incidente

```
ERESOLVE unable to resolve dependency tree
Found: react@18.2.0
peer react@">=19.0.0" from @testing-library/react-native@14.0.1
```

O agente LLM escolheu cada versão isoladamente; nada garantia que o CONJUNTO
fosse coerente. Falha estrutural: ausência de compatibilidade entre versões.

## Arquitetura (`app/services/stack_compatibility.py`)

### 1. Dependency Compatibility Matrix

Regras por **major do React travado**, com janela `(major, minor)` inclusiva,
versão sugerida, motivo e impacto:

| React | pacote | janela | sugerida |
|---|---|---|---|
| 18 | @testing-library/react-native | 11.0–12.x | ^12.9.0 |
| 18 | @testing-library/react | 13–16 | ^16.3.0 |
| 18 | next | 13–14 | ^14.2.3 |
| 18 | react-dom / react-test-renderer / @types/react(-dom) | 18.x | ^18.x |
| 18 | react-native | 0.72–0.76 | 0.74.5 |
| 18 | expo | SDK 50–51 | ~51.0.0 |
| 19 | @testing-library/react-native | 13–14 | ^14.0.0 |
| 19 | next | 15 | ^15.3.0 |
| 19 | react-native / expo | 0.78+ / SDK 53 | 0.79.2 / ~53.0.0 |

Toda dependência do `package.json` é validada contra a matriz **antes** de
qualquer npm; incompatível ⇒ movida para a versão sugerida (Auto Version Fixer).

### 2. Stack Lock (imutável durante a geração)

`stack.lock.json` captura os âncoras (react, react-native, expo, node engines)
do primeiro manifest e passa a ser a fonte da verdade: passes subsequentes
CARREGAM o lock (nunca re-derivam), e um manifest que drifta (ex.: agente troca
react ^18 → ^19, ou RN 0.74 → 0.79) é **restaurado ao lock**. Âncoras nunca são
alterados por nenhum fix automático.

### 3. Dependency Resolver + relatórios

`validate_and_fix` roda no gate pré-install do `BuildValidationService._node`
(depois do Dependency Registry): valida, corrige e grava
**`stack.compatibility.json`** (lock + findings com current/required/suggested/
reason/impact/status). O resultado também vai em
`BuildValidationReport.stack_compatibility` → `build.report.json`.

### 4. Preflight Build Check

Antes do install real: **`npm install --dry-run`** simula a resolução da árvore
completa sem escrever `node_modules`. Falha previsível (ERESOLVE/E404/ETARGET)
é classificada e reparada no loop bounded (3 por erro, 5 comandos por fase); o
install real só roda depois que a simulação passa. Fase registrada como
`preflight` nos commands/repairs do relatório.

### 5. Auto Version Fixer + Build Guard (ERESOLVE)

Reparo de ERESOLVE mudou de comportamento:

- **antes**: `--legacy-peer-deps` (mascarava a incoerência);
- **agora**: parse do log (`Found: X@v` / `peer X@range from Y@v`) →
  `diagnose_peer_conflict` consulta a matriz → o **pacote conflitante** é movido
  para a versão compatível (ex.: testing-library 14 → ^12.9.0) e o comando
  reexecuta. `--legacy-peer-deps` foi removido.
- Se a única saída fosse mudar um âncora (upgrade do React):
  `requires_user_decision = True`, **nenhum fix automático**, o install é
  bloqueado no preflight com o diagnóstico completo.

### 6. Diagnóstico claro

`ClassifiedBuildError.conflict` (e o schema/`build.report.json`) carrega:
pacote conflitante, versão atual, versão requerida (`react@">=19.0.0"`),
âncora + versão atual da stack, **versão compatível sugerida** e **impacto da
mudança**. A mensagem do job usa esses campos (card de falha da Meta-Fábrica).

### 7. Prevenção no prompt

`FRONTEND_RULES` ganhou o bloco "Coerência de versões" com os dois conjuntos
(React 18 e React 19) explícitos para o agente.

## Testes (`tests/test_stack_compatibility.py` + atualizações)

- React 18 gera sem ERESOLVE (matriz corrige antes do npm; sem repairs);
- `@testing-library/react-native@14` bloqueado/corrigido em React 18;
- Stack Lock capturado, persistido e restaurando drift (react major e RN minor);
- React nunca muda automaticamente (conflito desconhecido ⇒ decisão do usuário,
  fixer recusa, sem `--legacy-peer-deps`);
- preflight repara ERESOLVE e o `npm install` real sempre passa; conflito
  irresolvível bloqueia ANTES do install real (só `--dry-run` executa);
- sanidade da matriz: toda versão sugerida satisfaz a própria janela.

## Critério de aceitação

- Árvore quebrada nunca chega ao build: matriz (estático) + dry-run (dinâmico).
- `npm install` não falha por incompatibilidade previsível: ela é corrigida ou
  bloqueada com diagnóstico na simulação.
- Versões coerentes por ecossistema: janela única por React major, âncoras
  travados, dependentes ajustados.
