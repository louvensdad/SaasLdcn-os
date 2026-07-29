# Motor de execução do MLTagente

## Objetivo

Receber o projeto gerado, preparar o ambiente, executar os serviços e disponibilizar um preview.

## Processo

1. Receber arquivos e identificar tecnologias.
2. Criar ambiente isolado e instalar dependências.
3. Configurar variáveis e banco.
4. Executar migrations.
5. Iniciar backend e detectar porta.
6. Iniciar frontend e detectar porta.
7. Criar URL segura de preview.
8. Exibir no navegador integrado.
9. Capturar logs e erros.
10. Enviar falhas ao agente corretor.

## Dependências

- [[Sandbox de execução]]
- [[Navegador integrado]]
- [[Console integrado]]
- [[Correção automática de erros]]
- [[Histórico de versões]]
- [[Infraestrutura e deploy]]

## Critérios de aceitação

- [ ] Execução reproduzível a partir de uma versão.
- [ ] Falhas geram diagnóstico acionável.
- [ ] Preview não expõe portas diretamente.
