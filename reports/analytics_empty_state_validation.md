# Analytics empty state validation

Quando `/api/analytics/overview` responde `404` ou retorna `metrics: []`, a página não exibe números, eixos, mapas ou gráficos artificiais.

A interface mostra:

- “Analytics ainda está coletando dados.”
- instrução para executar geração, modernização ou laboratório;
- ações para Meta-Fábrica, Modernize e Engineering Laboratory.

Falhas operacionais diferentes de `404` permanecem distinguíveis: a página mostra erro consultável e ação de retry, sem reaproveitar valores antigos como se fossem atuais.

