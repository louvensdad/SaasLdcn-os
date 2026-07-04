# Dependency Registry — validação de dependências antes do npm install

Data: 2026-07-03 · Branch: feat/premium-foundation

## Problema

A Meta-Fábrica gerou um `package.json` com `@radix-ui/react-badge@^1.0.4`, um
pacote que **não existe** no registro npm. O `npm install` falhava com:

```
npm ERR! 404 Not Found - GET https://registry.npmjs.org/@radix-ui%2freact-badge
```

LLMs inventam nomes de pacotes plausíveis; sem um gate determinístico, qualquer
nome inventado derruba o build inteiro.

## Solução implementada

### 1. Registry interno (`app/services/dependency_registry.py`)

- **`RADIX_ALLOWLIST`** — os primitives Radix UI que realmente existem
  (accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, label,
  popover, progress, radio-group, scroll-area, select, separator, slot, switch,
  tabs, toast, tooltip + demais primitives reais). Qualquer `@radix-ui/*` fora
  da allowlist é tratado como **inventado e bloqueado**.
- **`KNOWN_BAD_PACKAGES`** — tabela de pacotes que LLMs inventam, cada um com o
  patch determinístico correspondente. `@radix-ui/react-badge` → remover a
  dependência, materializar `components/ui/badge.tsx` local (Tailwind, zero
  dependências) e reescrever os imports para `@/components/ui/badge`.
- **Regras de nome npm** — nomes que violam as regras do npm (maiúsculas,
  caracteres inválidos) são marcados `invalid_name` e removidos.

### 2. Validação ANTES do npm install

`BuildValidationService._node` agora chama `dependency_registry.validate_and_fix`
**antes** do primeiro `npm install`:

1. valida todos os `package.json` do projeto gerado (raiz, apps/web, apps/api,
   apps/mobile, frontend, backend);
2. remove pacotes proibidos/inventados;
3. cria o componente local substituto (quando conhecido) e reescreve imports;
4. apaga `package-lock.json` obsoleto;
5. grava **`dependency.validation.json`** na raiz do projeto com todos os
   findings (manifest, pacote, seção, status, motivo, patch, arquivos escritos e
   reescritos).

### 3. Prompt do agente Frontend endurecido

`FRONTEND_RULES` agora contém a allowlist Radix explícita e a proibição direta:
"`@radix-ui/react-badge` NÃO EXISTE — Badge é sempre um componente local".

## Testes (apps/api/tests/test_stack_gate_and_build_repair.py)

- `test_package_json_with_radix_badge_is_rejected` — o manifest com react-badge
  é rejeitado; primitives reais continuam válidos.
- `test_auto_repair_removes_radix_badge_and_writes_validation_report` — o
  auto-fix remove o pacote e grava `dependency.validation.json`.
- `test_local_badge_component_is_created_and_imports_rewritten` — o Badge local
  é criado e o import no código gerado é reescrito.

## Critério de aprovação

`@radix-ui/react-badge` nunca mais chega ao `npm install`: é bloqueado no gate
pré-install, e mesmo que escapasse (ex.: manifest gerado fora do fluxo), o
classificador E404 do auto-repair o remove e reexecuta o install.
