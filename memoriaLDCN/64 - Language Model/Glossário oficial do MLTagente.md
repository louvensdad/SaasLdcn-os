# Glossário oficial do MLTagente

| Termo | Definição oficial |
|---|---|
| PromptMaster.md | Descrição estruturada da intenção, escopo, regras e critérios do usuário. |
| Blueprint | Especificação técnica e estrutural que orienta planejamento e geração. |
| Plano | Grafo ordenado de tarefas necessárias para produzir um resultado. |
| Feature | Capacidade de produto que pode ser planejada, implementada e liberada. |
| Task | Unidade executável de trabalho atribuída a um agente ou pessoa. |
| Change Request | Pedido versionado de alteração incremental. |
| Patch | Conjunto mínimo de mudanças aplicáveis a uma versão. |
| Build | Transformação de uma versão em artefato executável. |
| Execution | Instância rastreável de uma operação do sistema. |
| Runtime | Ambiente que executa processos e serviços. |
| Preview | Ambiente temporário para validação interativa. |
| Deploy | Publicação de uma versão em um ambiente alvo. |
| Skill | Executor especializado com capacidades e permissões declaradas (também referido como Agent em documentos mais antigos). |
| Capability | Ação que uma Skill, plugin, modelo ou ferramenta consegue realizar. |
| Contexto | Conjunto de informações selecionadas para uma execução. |
| Memória | Informação persistida para uso futuro conforme escopo e política. |
| Evento | Fato imutável ocorrido na plataforma. |
| Comando | Solicitação para que uma operação seja executada. |
| Meta-Factory | Motor que coordena os motores estratégicos da plataforma (também referido como Meta Engine em documentos mais antigos). |

## Regra

Novos termos devem ser adicionados aqui antes de aparecerem em contratos públicos.

## Correspondência com a implementação real

Decisão de 2026-07-19: o MLTagente é o mesmo produto já implementado em `apps/api` (Python/FastAPI) + `apps/web` (Next.js). Onde o código em produção já usa um nome diferente do termo antes registrado neste glossário, o termo do código passa a ser oficial, para evitar um terceiro vocabulário. Termos renomeados nesta revisão:

| Termo anterior no vault | Termo oficial atual | Motivo |
|---|---|---|
| Prompt.md | PromptMaster.md | Nome do artefato já implementado e testado em `prompt_master_md_engine.py`; renomear o código teria alto risco sobre suíte de testes existente. |
| Agent | Skill | Já implementado como `skill_registry_engine.py` / rotas `/skills`. |
| Meta Engine | Meta-Factory | Já implementado como `routes/meta_factory.py`. |

Isso é uma mudança **minor** por [[Política de compatibilidade dos contratos]] (nomes anteriores permanecem documentados como alias, nenhum significado foi removido). Gaps de implementação identificados na mesma auditoria (Máquina de Estados Global e Catálogo de eventos ainda não batem com o código) estão marcados nos respectivos documentos e permanecem em aberto — não foram resolvidos aqui.


Termos de billing, trial e Plano Estudante: [[Planos, assinaturas e controle de acesso]].

| Plano Estudante | Modalidade comercial do Plano Básico, disponível somente após comprovação de matrícula vigente; possui os mesmos recursos e limites do Básico. |
| Elegibilidade estudantil | Estado verificável da matrícula do usuário, separado da assinatura e das permissões. |
| Revalidação | Nova comprovação solicitada antes ou após o vencimento da elegibilidade. |
