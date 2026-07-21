# Marketplace e distribuição

## Objetivo

Permitir descobrir, avaliar, instalar, vender, atualizar e remover templates, agentes, prompts, componentes, integrações, automações e plugins.

## Descrição completa

O marketplace precisa de manifesto, versão, compatibilidade, licença, permissões, dependências, autor, reputação, revisão, preço, changelog, assinatura de artefatos e política de atualização.

## Problema que resolve

Evita que cada equipe recrie ativos e reduz o risco de instalar extensões sem procedência ou controle de permissões.

## Fluxo

Publicação → validação automática → revisão → catálogo → instalação em sandbox → consentimento de permissões → ativação → atualização ou rollback.

## Dependências

[[Sistema de Plugins]], [[Sistema de Billing]], [[Controles de segurança]], storage de artefatos e pipeline de revisão.

## Relacionamentos

Conecta templates, arquiteturas, automações, agentes, prompts, integrações, billing e governança.

## Notas relacionadas

[[Governança de artefatos]], [[Licenciamento de ativos]], [[Marketplace de agentes]], [[Marketplace de integrações]]

## Critérios de aceitação

- [ ] Artefatos têm versão, hash, autor, licença e permissões.
- [ ] Instalação ocorre isolada antes da ativação.
- [ ] Atualizações possuem diff e rollback.
- [ ] Itens pagos respeitam entitlements.
- [ ] Artefatos rejeitados não ficam disponíveis para instalação.

## Prioridade

Média

## Fase

Beta; marketplace comercial em Enterprise.
