# Arquitetura aprofundada do Sandbox

## Camadas possíveis

- Container para isolamento operacional.
- Firecracker ou VM leve para isolamento forte quando necessário.
- Kubernetes para agendamento e escalabilidade.
- Proxy de rede, filesystem temporário e cofre de segredos.

## Controles

Limites de CPU, memória, disco, processos, rede e tempo; imagens assinadas; allowlist de egress; descarte automático; auditoria; sem acesso entre projetos.

A escolha final depende do risco, custo, latência e requisito de compatibilidade de cada tipo de projeto.
