# Política de “sem sucesso falso”

Um projeto só recebe `READY` quando todos os steps terminam, o validador local aprova qualidade/dependências/build e o serviço cria o pacote.

Antes disso:

- `partial=true`;
- `valid=false` até o build;
- `packageReady=false` até o ZIP;
- o marker `.ldcn-generation.json` mantém `partial=true`.

Após build aprovado o marker recebe verificação e score. Apenas depois do pacote ele recebe `partial=false` e `package_ready=true`. Build ausente ou não executável é bloqueio, não warning de sucesso. A UI só libera download final com `READY && valid && packageReady && !partial`.
