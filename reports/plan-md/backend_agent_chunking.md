# Chunking do Backend Agent

O Backend não é mais uma chamada monolítica. A state machine cria e valida sequencialmente os chunks:

1. structure
2. package/config
3. domain/entities
4. DTOs
5. controllers
6. services
7. repositories
8. auth
9. validation
10. error handling
11. tests
12. OpenAPI sync

Cada chamada informa o chunk corrente e proíbe repetir arquivos anteriores. Artefatos válidos são gravados imediatamente; a lista de arquivos já emitidos entra no contexto seguinte. Uma falha preserva todos os chunks anteriores e permite reexecutar Backend sem voltar a Contracts ou Database.
