# Roadmap Dependency Graph

## Implementacao

O grafo de dependencias passou a ser emitido pelo backend em `dependency_edges`.

Cada aresta possui:

- `source`
- `target`
- `kind`
- `impact`
- `contractVersion`

A UI renderiza o mapa em `EdgeMap`, com selecao clicavel que abre o painel de detalhe do modulo impactado.

## Integridade

As arestas sao calculadas a partir do campo `dependencies` dos itens do roadmap. Dependencias que nao existem no catalogo governado sao ignoradas pela engine para evitar mostrar relacoes inexistentes.

## Fluxo principal

Project Room -> PromptMaster -> Architect -> Blueprint -> Meta-Factory -> Engineering Review -> Engineering Laboratory -> Deploy Center.
