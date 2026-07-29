# Matriz de Rastreabilidade

## Regras de Negócio

| ID | Regra | Entidades | Use-Case | Teste |
|----|-------|-----------|----------|-------|
| BR1 | Cada conta cadastrada vira uma instância isolada com seu próprio estado (online/offline). | Account, Instance | `CreateAccountUseCase` | `test_create_account_success` |
| BR2 | O número de instâncias simultâneas é limitado pelo plano do usuário. | User, Instance | `StartInstanceUseCase`, `StartAllInstancesUseCase`, `InstancePolicyService.check_instance_limit` | `test_start_instance_success`, `test_start_all_success` |
| BR3 | Toda execução de macro fica registrada em log com timestamp e resultado. | Macro, ExecutionLog, Instance | `ExecuteMacroUseCase` | `test_execute_macro_success` |
| BR4 | Uma instância não pode ser iniciada duas vezes ao mesmo tempo. | Instance | `StartInstanceUseCase` (verifica status) | `test_start_instance_already_online` |
| BR5 | Usuário deve ser autenticado para acessar recursos. | User | `LoginUseCase`, `RefreshTokenUseCase`, `GetCurrentUserUseCase` | `test_login_success`, `test_refresh_success`, `test_get_current_user_success` |
| BR6 | Administradores podem gerenciar todos os usuários. | User | `ListUsersAdminUseCase`, `GetUserAdminUseCase`, `UpdateUserAdminUseCase`, `DeleteUserAdminUseCase` | `test_list_users`, `test_get_user`, `test_update_user`, `test_delete_user` |

## Mapeamento para Endpoints da API

| Endpoint | Use-Case |
|----------|----------|
| POST /auth/register | `RegisterUserUseCase` |
| POST /auth/login | `LoginUseCase` |
| POST /auth/refresh | `RefreshTokenUseCase` |
| GET /auth/me | `GetCurrentUserUseCase` |
| POST /accounts | `CreateAccountUseCase` |
| GET /accounts | `ListAccountsUseCase` |
| GET /accounts/{account_id} | `GetAccountUseCase` |
| PUT /accounts/{account_id} | `UpdateAccountUseCase` |
| DELETE /accounts/{account_id} | `DeleteAccountUseCase` |
| GET /instances | `ListInstancesUseCase` |
| GET /instances/{instance_id} | `GetInstanceUseCase` |
| POST /instances/{instance_id}/start | `StartInstanceUseCase` |
| POST /instances/{instance_id}/stop | `StopInstanceUseCase` |
| POST /instances/start | `StartAllInstancesUseCase` |
| POST /macros | `CreateMacroUseCase` |
| GET /macros | `ListMacrosUseCase` |
| GET /macros/{macro_id} | `GetMacroUseCase` |
| PUT /macros/{macro_id} | `UpdateMacroUseCase` |
| DELETE /macros/{macro_id} | `DeleteMacroUseCase` |
| POST /macros/{macro_id}/associate | `AssociateMacroUseCase` |
| POST /macros/{macro_id}/execute | `ExecuteMacroUseCase` |
| GET /logs | `ListExecutionLogsUseCase` |
| GET /logs/{log_id} | `GetExecutionLogUseCase` |
| GET /admin/users | `ListUsersAdminUseCase` |
| GET /admin/users/{user_id} | `GetUserAdminUseCase` |
| PUT /admin/users/{user_id} | `UpdateUserAdminUseCase` |
| DELETE /admin/users/{user_id} | `DeleteUserAdminUseCase` |