# Fix — build falhou com @radix-ui/react-badge (npm E404)

Data: 2026-07-03 · Branch: feat/premium-foundation

## Incidente

Em http://localhost:3000/meta-factory, o estágio de build do projeto gerado
falhou no `npm install`:

```
npm ERR! code E404
npm ERR! 404 Not Found - GET https://registry.npmjs.org/@radix-ui%2freact-badge
npm ERR! 404  The requested resource '@radix-ui/react-badge@^1.0.4' could not be found
```

Causa raiz: o agente Frontend (LLM) inventou o pacote `@radix-ui/react-badge`,
que nunca existiu — Radix UI não publica um primitive Badge.

## Correção em três camadas (defesa em profundidade)

1. **Prevenção (prompt)** — `FRONTEND_RULES` agora carrega a allowlist Radix e a
   proibição explícita do react-badge; Badge é sempre local
   (`components/ui/badge.tsx` com Tailwind).
2. **Gate pré-install (Dependency Registry)** — `validate_and_fix` roda antes do
   primeiro `npm install`, remove o pacote, cria o Badge local, reescreve os
   imports e registra tudo em `dependency.validation.json`.
3. **Auto-repair no install (BuildErrorClassifier)** — se um E404 ainda ocorrer
   (pacote inventado desconhecido), o log é classificado como
   `npm_package_not_found`, o pacote é removido do manifest
   (`fix_missing_package`, com substituição local quando conhecida), o lockfile
   é apagado e o `npm install` é **reexecutado automaticamente** — até 3 vezes
   por erro, 5 comandos por fase.

## O patch específico do Badge

- `package.json`: `@radix-ui/react-badge` removido de qualquer seção
  (dependencies/devDependencies/peerDependencies/optionalDependencies).
- `components/ui/badge.tsx`: componente Badge local gerado (variants
  default/secondary/destructive/outline, Tailwind puro, zero dependências).
- Imports: `from "@radix-ui/react-badge"` → `from "@/components/ui/badge"` em
  todos os `.ts/.tsx/.js/.jsx` do app (node_modules excluído).
- `package-lock.json`: removido para o npm não re-resolver o pacote morto.

## Evidência (testes)

- `test_npm_install_is_rerun_after_e404_repair` — install falha com E404,
  patch aplicado, install reexecutado e aprovado (2 execuções registradas).
- `test_build_passes_only_after_repair` — o build só passa depois do repair;
  sequência registrada: install(fail) → install(ok) → build(ok).
- `test_local_badge_component_is_created_and_imports_rewritten`.

Suíte completa do backend: **675 passed** (2026-07-03).
