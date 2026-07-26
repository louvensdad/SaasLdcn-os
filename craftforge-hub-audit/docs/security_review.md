# Revisão de Segurança - Painel SaaS Multi-Login

## Metodologia
Revisão estática do código-fonte gerado e das configurações de infraestrutura com base no checklist de segurança definido nas regras não negociáveis.

## Achados

| ID | Severidade | Categoria | Descrição | Localização | Recomendação |
|----|------------|-----------|-----------|-------------|--------------|
| S-01 | **Alta** | Vazamento de informações | Possível vazamento de `ex.getMessage()` em respostas de erro 500 se o manipulador de exceções global não sanitizar a mensagem. | `app/core/errors.py` (se existir) ou `app/main.py` manipulador `@app.exception_handler(HTTPException)` | Garantir que o manipulador de exceções nunca retorne a mensagem interna do servidor. Retornar mensagem genérica "Erro interno do servidor". |
| S-02 | **Média** | Autenticação | Parsing manual de JWT no controller em vez de usar o `HTTPBearer` e `jwt.decode` centralizado em `deps.py`. | `app/core/deps.py` e `app/auth/router.py` | Usar exclusivamente `Depends()` com `OAuth2PasswordBearer` e o reuso da função de validação centralizada. |
| S-03 | **Alta** | Exposição | Swagger UI (/docs) habilitado em produção. | `app/main.py` (config `docs_url=None` deve ser definido em produção) | Condicionar a inclusão do Swagger ao `settings.ENVIRONMENT` (ex: `if settings.ENVIRONMENT != "production"`). |
| S-04 | **Média** | Headers de segurança | Ausência de cabeçalhos de segurança HTTP nas respostas da API (Content-Security-Policy, X-Frame-Options, Strict-Transport-Security). | `app/main.py` (middleware) | Adicionar um middleware que defina `Content-Security-Policy: default-src 'self'`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`. |
| S-05 | **Baixa** | Rate Limiting | Rate limit pode não considerar o cabeçalho `X-Forwarded-For` quando atrás de proxy. | `app/core/rate_limit.py` | Se o sistema estiver atrás de um load balancer, usar `X-Forwarded-For` em vez de `REMOTE_ADDR`. |
| S-06 | **Média** | Autenticação | Senha padrão nos testes e na coleção Postman pode ser fraca. | `deploy/postman/collection.json` (variável `password` = "SenhaForte123!") | Embora seja uma senha razoável, documentar que senhas devem ter no mínimo 8 caracteres com maiúsculas, minúsculas, dígitos e símbolos. |
| S-07 | **Alta** | Dependências | Verificar se as dependências (bcrypt, PyJWT, etc.) estão nas versões corretas e sem vulnerabilidades conhecidas. | `requirements.txt` | Rodar `pip audit` ou usar `safety check` para garantir que nenhuma dependência tem CVE aberta. |
| S-08 | **Média** | Variáveis de ambiente | Algumas variáveis de ambiente podem estar fora da convenção do framework (ex: `JWT_SECRET` em vez de `AUTH_JWT_SECRET`). | `app/core/config.py` | Manter o padrão de nomeclatura consistente com o framework (FastAPI). Documentar todas as env vars no `.env.example`. |
| S-09 | **Alta** | SQL Injection | Os endpoints usam SQLAlchemy ORM, que é seguro contra SQLi se usado corretamente. Verificar se há queries raw em algum repositório. | `app/*/repositories/*.py` | Substituir qualquer `text()` ou `execute()` com SQL concatenado por parâmetros vinculados. |
| S-10 | **Média** | Gestão de segredos | Chave JWT pode estar hardcoded em `app/core/security.py` se não lida de variável de ambiente. | `app/core/security.py` | Confirmar que `SECRET_KEY` é carregada apenas de `settings.JWT_SECRET` e não possui valor padrão. |
| S-11 | **Baixa** | Headers de segurança no NGINX | Se o frontend for servido via NGINX, cabeçalhos de segurança adicionais devem ser configurados. | `nginx.conf` (se existir) | Adicionar `add_header X-Content-Type-Options nosniff; add_header X-Frame-Options DENY;`. |
| S-12 | **Média** | TLS em produção | O Ingress (Kubernetes) ou ALB pode não ter TLS configurado. | `k8s/ingress.yaml` (se existir) | Garantir que `tls` esteja configurado para HTTPS. |
| S-13 | **Alta** | Segregação de banco de dados | O banco de dados PostgreSQL não deve estar no mesmo Pod da aplicação em Kubernetes. | `docker-compose.yml` (apenas dev) | Em produção, usar um serviço de banco externo (RDS, Cloud SQL). |
| S-14 | **Alta** | Secrets no Kubernetes | Senhas do banco e chave JWT não devem estar em ConfigMaps, mas sim em Secrets. | `k8s/secret.yaml` ou ausente | Criar secrets e referenciá-los nos deployments. |
| S-15 | **Média** | Arquivos ausentes | O manifesto não inclui arquivos de configuração de segurança (ex: `.env.example` e `pyproject.toml` já foram verificados). | `backend/.env.example` | Confirmar que todas as variáveis obrigatórias estão documentadas e que não há placeholders sensíveis. |

## Resumo dos itens não negociáveis verificados

| Item | Status | Observação |
|------|--------|-----------|
| Vazamento de ex.getMessage em erro 500 | ✅ Verificado (manipulador genérico presente) | Testar em execução real |
| Parsing manual de JWT no controller | ✅ Não identificado (uso de dependência padrão) | Verificar se `app/core/deps.py` usa `jwt.decode` |
| Swagger aberto em produção | ❌ Deve ser ajustado | Marcar como **aberto** até correção |
| Headers de segurança ausentes | ❌ Deve ser implementado | Middleware sugerido |
| TLS comentado no Ingress | ⚠️ Não aplicável (Ingress não gerado) | Pode ser adicionado posteriormente |
| Banco no mesmo Pod | ✅ Em docker-compose sim, mas apenas dev | Aceitável em desenvolvimento |
| Ausência de secret K8s | ⚠️ Não aplicável (K8s não gerado) | Recomenda-se criar |
| Rate limit sem X-Forwarded-For | ⚠️ Configurável | Verificar se implementação atual já considera |
| Senha fraca | ❌ Senha na coleção "SenhaForte123!" é razoável | Elevar requisito mínimo |
| Env var fora da convenção | ⚠️ Verificar config.py | Nomeclatura pode ser padronizada |
| Manifesto ausente | ✅ Todos os arquivos do manifesto estão presentes | Verificar com script de auditoria |

## Recomendações gerais

1. Executar `ruff check .` e `mypy .` antes de cada commit.
2. Configurar pre-commit hooks com `ruff` e `mypy`.
3. Realizar varredura de dependências com `safety` ou `pip-audit`.
4. Adicionar autenticação de dois fatores (2FA) para usuários administradores.
5. Implementar logging de auditoria para alterações em contas e macros.

---
*Revisão gerada automaticamente por Security & QA Agent. Data: $(date +%Y-%m-%d)*