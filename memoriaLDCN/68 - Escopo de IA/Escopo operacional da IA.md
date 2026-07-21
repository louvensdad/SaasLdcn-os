# Escopo operacional da IA

## Objetivo

Permitir que o usuário solicite somente uma parte do trabalho sem disparar o ciclo completo.

## Modos

- Criar sistema completo
- Criar somente API
- Criar somente frontend
- Melhorar testes
- Refatorar módulo
- Migrar banco
- Gerar documentação
- Diagnosticar erro
- Planejar sem executar

## Contrato

```yaml
scope:
  target: backend.api
  operation: generate
  allowed_files: []
  forbidden_files: []
  execution_mode: plan_and_apply
  approval_required: true
```

## Critérios de aceitação

- [ ] Escopo limita agentes, arquivos e ferramentas.
- [ ] A IA não executa etapas fora do pedido sem explicar.
- [ ] Dependências necessárias são listadas antes da execução.
- [ ] Usuário pode ampliar o escopo explicitamente.
