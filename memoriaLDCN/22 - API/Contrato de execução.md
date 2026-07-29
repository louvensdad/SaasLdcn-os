# Contrato de execução

Operações longas retornam `run_id`, `project_id`, `version_id`, `status` e `created_at`. Estados mínimos: queued, running, waiting, succeeded, failed, cancelled.

Eventos e logs devem permitir acompanhar a execução sem polling obrigatório.
