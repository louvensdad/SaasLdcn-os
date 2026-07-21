# Como entender o MLTagente em 30 minutos

## Ordem de leitura

### 1. Constituição

Leia [[Constituição do MLTagente]] para entender as regras que não podem ser quebradas.

### 2. Visão

Leia [[Visão do MLTagente]] para entender o problema e o produto.

### 3. Fluxo principal

Leia [[Fluxo completo da plataforma]] e [[Fluxo oficial do MVP]].

### 4. Domain Model

Leia [[Domain Model do MLTagente]] e [[Glossário oficial do MLTagente]].

### 5. Chat de Criação

Leia [[Mapa do Chat de Criação]], [[Prompt.md Schema]] e [[Contrato do Prompt.md]].

### 6. Blueprint

Leia [[Mapa de Blueprint]], [[Blueprint Schema]] e [[Política de evolução do Blueprint]].

### 7. Engines

Leia [[Mapa dos sete motores]] e [[Meta Engine]].

### 8. Contratos, estados e eventos

Leia [[Mapa de contratos]], [[Máquina de Estados Global]] e [[Catálogo de eventos da plataforma]].

### 9. MVP

Leia [[Plano de implementação do vertical slice]], [[Matriz de rastreabilidade]] e [[Definition of Done]].

### 10. Começar a implementar

Implemente primeiro o fluxo Lista de Tarefas com a stack fixa do MVP. Não comece por Marketplace, Mobile, Kubernetes ou múltiplos provedores de IA.

## Resumo em uma frase

O usuário fornece intenção; o Chat de Criação produz Prompt.md; o Blueprint estrutura; a Meta Engine coordena; os agentes constroem; o Runtime executa; o Preview valida; a evolução aplica mudanças reversíveis.

## Critério de sucesso

Uma pessoa nova na equipe deve conseguir explicar o fluxo e localizar o contrato, schema, evento, estado e teste de uma funcionalidade em até 30 minutos.
