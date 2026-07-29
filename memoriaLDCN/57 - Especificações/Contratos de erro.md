# Contratos de erro

## Formato

```json
{
  "code": "BUILD_DEPENDENCY_INSTALL_FAILED",
  "message": "Dependency installation failed",
  "user_message": "O projeto encontrou um problema durante a preparação.",
  "retryable": true,
  "run_id": "run_123",
  "details": {},
  "correlation_id": "corr_123"
}
```

## Regras

`code` é estável; `message` é técnico; `user_message` é seguro e localizado; `retryable` orienta a recuperação; `details` não contém secrets.

## Critérios de aceitação

- [ ] Todo módulo converte falhas para o formato.
- [ ] IA corretora recebe causa, evidência e tentativa.
- [ ] Usuário vê ação recomendada sem stack trace obrigatório.
