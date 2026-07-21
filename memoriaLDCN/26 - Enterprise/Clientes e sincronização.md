# Clientes e sincronização

## Objetivo

Definir a experiência fora do navegador: CLI, extensão VS Code, desktop, mobile, offline e sincronização segura.

## Descrição completa

Clientes devem compartilhar autenticação, projetos, eventos e conflitos. O modo offline mantém operações locais limitadas e sincroniza com resolução explícita de conflitos.

## Problema que resolve

Atende desenvolvedores que precisam trabalhar localmente e equipes que alternam entre desktop, navegador e mobile.

## Fluxo

Login → selecionar workspace → sincronizar metadados → operar → gerar mudanças → detectar conflito → revisar → sincronizar versão aprovada.

## Dependências

API pública, sistema de arquivos, versões, identidade, eventos e permissões.

## Relacionamentos

Conecta Git, editor, preview, notificações e colaboração.

## Notas relacionadas

[[CLI do MLTagente]], [[Extensão VSCode]], [[Aplicação Desktop]], [[Aplicação Mobile]], [[Protocolo de sincronização]]

## Critérios de aceitação

- [ ] Cliente não sobrescreve mudanças sem detectar conflito.
- [ ] Offline nunca expõe secrets indevidamente.
- [ ] Revogação de sessão propaga para todos os clientes.
- [ ] A mesma versão é identificável em qualquer superfície.

## Prioridade

Baixa

## Fase

Futuro; extensão técnica pode entrar no Beta.
