# Política de isolamento e abuso

## Limites padrão

- Rede: deny by default, allowlist de domínios e portas.
- Filesystem: somente workspace temporário e volumes declarados.
- Processos: sem privilégios elevados e limite de processos filhos.
- Tempo: timeout por tipo de execução.
- Projeto: limite de tamanho, arquivos, dependências e concorrência.
- Recursos: quotas de CPU, RAM, disco, tokens e containers.

## Bloqueios

Mineração de criptomoeda, malware, cryptomining, loops infinitos, varredura de rede, download de binários não permitidos e acesso a metadata de cloud.

## Fluxo

Submissão → análise estática → política → sandbox → monitoramento → interrupção automática se exceder → evidência e auditoria.

## Critérios de aceitação

- [ ] Execução não acessa outro tenant.
- [ ] Processo excedente é encerrado.
- [ ] Ação bloqueada informa motivo seguro.
- [ ] Exceções exigem aprovação e expiração.
