# Localization 100% Audit

## Idiomas

- pt-BR
- en-US
- es-ES
- fr-FR

## Estado

O sistema de localization mantém dicionários para os quatro idiomas e agora garante paridade estrutural de chaves pela composição com o dicionário base. As novas superfícies premium usam `useLocale()` para títulos, descrições, labels, filtros, botões e mensagens principais.

## Auditoria estática

- Atributos JSX hardcoded (`title`, `description`, `placeholder`, `aria-label`) encontrados: 0.
- Nós de texto JSX potencialmente hardcoded encontrados: 241.

Os 241 resultados incluem conteúdo técnico legado, dados de demonstração e copy em páginas fora das superfícies V3. Portanto, a cobertura estrutural de chave está completa, mas a migração linguística integral de todo o legado ainda não pode ser declarada como 100% sem falso positivo.

## Proteção

- Chaves ausentes não ficam visíveis ao usuário nas novas superfícies.
- Seleção de locale permanece independente para interface, documentação, comentários e projeto gerado.
