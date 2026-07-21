# Fluxo de APIs

Frontend → API Gateway → autenticação → autorização → serviço de domínio → fila ou execução síncrona → evento → atualização da interface.

Operações de build, preview, deploy e agentes retornam `run_id` e podem ser acompanhadas por status, eventos e logs.
