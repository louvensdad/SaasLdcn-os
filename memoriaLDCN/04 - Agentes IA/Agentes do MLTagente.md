# Agentes do MLTagente

## Agentes

Product Owner, Analista de Requisitos, Arquiteto, UX/UI, Frontend, Backend, Mobile, DevOps, QA, Segurança, Banco de Dados, Documentação, Automação, Revisor, Corretor de Erros e Deploy.

## Coordenação

O agente orquestrador recebe o pedido, identifica o tipo de projeto, cria o plano, seleciona agentes, distribui tarefas, valida resultados, executa o projeto e entrega o preview.

## Contrato de cada agente

- Entrada e contexto necessários
- Responsabilidade explícita
- Arquivos permitidos
- Saída esperada
- Critérios de validação
- Dependências e handoff para outros agentes

## Execução e chaves de IA

Nenhum agente conhece diretamente OpenAI, Claude, Gemini ou qualquer SDK de provedor — toda chamada passa por AIExecutionService → Provider Adapter → chave própria do usuário (ver [[Gestão de Chaves de IA (BYOK)]]). Antes de qualquer execução, o sistema verifica se existe uma chave ativa e válida para o provedor exigido; se não existir, a execução é bloqueada antes de iniciar e o usuário vê: "Nenhuma API configurada. Cadastre uma chave em: Configurações → Inteligência Artificial".

---
tipo: agentes
status: planejamento
---
