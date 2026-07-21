# Arquitetura multi-tenant

Organizações possuem workspaces; workspaces possuem projetos; projetos possuem arquivos, versões, execuções, credenciais e deploys.

Todo recurso deve carregar o escopo de organização e workspace quando aplicável. O isolamento vale para API, banco, armazenamento e runtime.
