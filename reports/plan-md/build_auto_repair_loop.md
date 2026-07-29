# Build Auto-Repair Loop — detectar → classificar → corrigir → reexecutar

Data: 2026-07-03 · Branch: feat/premium-foundation

## Problema

Quando o build do projeto gerado falhava (ex.: npm E404), a plataforma parava:
não corrigia automaticamente nem reexecutava até o projeto ficar válido.

## Arquitetura

### BuildErrorClassifier (`app/services/build_error_classifier.py`)

Log bruto → erro tipado com `code`, `message`, `root_cause`, `suggested_fix`,
`package` e `auto_fixable`. Catálogo inicial:

| code | detecção | auto-fix |
|---|---|---|
| `npm_package_not_found` | E404 (linha humana + URL do GET) | remover/substituir por componente local |
| `npm_version_not_found` | ETARGET/notarget | apontar para a última versão do registro |
| `npm_peer_dependency_conflict` | ERESOLVE | reinstalar com `--legacy-peer-deps` |
| `typescript_compile_error` | `error TS\d+` | não (exige reparo humano/LLM) |
| `missing_import` | Cannot find module local (`./`, `@/`) | não |
| `module_not_found` | Cannot find module de pacote npm | adicionar dependência real confirmada no registro |
| `missing_script` | npm Missing script | não |
| `missing_file` | ENOENT | não |
| `invalid_package_name` | Invalid package name / EINVALIDPACKAGENAME | remover do manifest |
| `unsupported_node_version` | EBADENGINE | não |
| `build_command_missing` | command not found / not recognized | não |

### Loop (`BuildValidationService._node`)

```
dependency_registry.validate_and_fix  (gate pré-install + dependency.validation.json)
└─ npm install ──falhou──> classificar ──auto_fixable──> aplicar patch ──> reexecutar
└─ npm run build / tsc ──falhou──> classificar ──> patch (módulo) ──> reinstalar/rebuildar
```

Limites duros: **3 tentativas por erro** (assinatura `code:package`) e
**5 comandos por fase** (`MAX_REPAIRS_PER_ERROR` / `MAX_ATTEMPTS_PER_PHASE`).
Sem patch seguro → o loop para e o erro classificado vai para o relatório.

### Auditoria completa (build.report.json)

`BuildValidationReport` agora carrega:

- `commands[]` — fase, comando, cwd, exitCode, duração (ms), stdout/stderr
  sanitizados (tails com redação de segredos);
- `repairs[]` — fase, tentativa, erro classificado (causa raiz), patch aplicado,
  aplicado?/detalhe;
- `classified_error` — o erro final quando o loop não conseguiu passar;
- `dependency_validation` — o resultado do gate pré-install.

O `generation_job_engine._build` persiste tudo em `build.report.json` e o
diagnóstico do job usa o erro classificado (causa + causa raiz + correção
sugerida + contagem de patches).

### Timeline em tempo real (UI)

Eventos novos no console vivo (`repair_started`, `repair_applied`,
`repair_failed`) alimentam o painel **Build Auto-Repair** na Meta-Fábrica:
"Detectando erro → Corrigindo package.json → Criando Badge local →
Reexecutando npm install → Build aprovado". Quando o build falha, o card mostra
**Build falhou** + causa classificada + botão
**Corrigir automaticamente e rodar novamente** (retry do estágio, que reentra no
loop), além de log completo e diagnóstico para download.

## Testes

- reexecução após repair (`test_npm_install_is_rerun_after_e404_repair`);
- build só passa depois do repair (`test_build_passes_only_after_repair`);
- loop limitado e erro classificado reportado
  (`test_repair_loop_stops_at_limit_and_reports_classified_error`);
- catálogo do classificador coberto caso a caso
  (`test_classifier_covers_initial_error_catalog`);
- build.report registra causa raiz + patch
  (`test_build_report_records_root_cause_and_patch`).
