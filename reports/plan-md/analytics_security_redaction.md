# Analytics security redaction

Antes da renderização, o client remove recursivamente campos cujos nomes indiquem:

- API keys;
- access/refresh tokens;
- secrets e passwords;
- credentials e authorization;
- prompts;
- raw logs.

A exportação CSV contém apenas métricas normalizadas (`label`, `value`, `unit`). O teste Playwright inclui segredos sentinela no payload e confirma que eles não aparecem no DOM nem no drill-down.

O client reutiliza autenticação em memória e refresh por cookie já existentes. Nenhuma credencial é persistida pelo módulo.

