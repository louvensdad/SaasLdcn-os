import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

class TestExecutionLogs:
    async def test_list_logs(self, auth_client: AsyncClient):
        # Criar dados: conta, macro, executar macro para gerar log
        account_resp = await auth_client.post("/accounts", json={"name": "Conta", "game_username": "j1", "password": "pwd"})
        account_id = account_resp.json()["id"]
        macro_resp = await auth_client.post("/macros", json={"name": "Macro", "script_content": "pass"})
        macro_id = macro_resp.json()["id"]
        await auth_client.post(f"/macros/{macro_id}/associate", json={"account_ids": [account_id]})
        await auth_client.post(f"/macros/{macro_id}/execute", json={"account_ids": [account_id]})
        # Listar logs
        response = await auth_client.get("/logs")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        log = data[0]
        assert "macro_id" in log
        assert "account_id" in log
        assert "executed_at" in log
        assert "result" in log

    async def test_get_log_by_id(self, auth_client: AsyncClient):
        # Cria log via execução
        account_resp = await auth_client.post("/accounts", json={"name": "Conta", "game_username": "j1", "password": "pwd"})
        account_id = account_resp.json()["id"]
        macro_resp = await auth_client.post("/macros", json={"name": "Macro", "script_content": "pass"})
        macro_id = macro_resp.json()["id"]
        await auth_client.post(f"/macros/{macro_id}/associate", json={"account_ids": [account_id]})
        exec_resp = await auth_client.post(f"/macros/{macro_id}/execute", json={"account_ids": [account_id]})
        log_id = exec_resp.json()["execution_id"]
        response = await auth_client.get(f"/logs/{log_id}")
        assert response.status_code == 200
        assert response.json()["id"] == log_id

    async def test_log_not_found(self, auth_client: AsyncClient):
        response = await auth_client.get("/logs/99999")
        assert response.status_code == 404

    async def test_log_timestamp_and_result(self, auth_client: AsyncClient):
        account_resp = await auth_client.post("/accounts", json={"name": "Conta", "game_username": "j1", "password": "pwd"})
        account_id = account_resp.json()["id"]
        macro_resp = await auth_client.post("/macros", json={"name": "Macro", "script_content": "pass"})
        macro_id = macro_resp.json()["id"]
        await auth_client.post(f"/macros/{macro_id}/associate", json={"account_ids": [account_id]})
        exec_resp = await auth_client.post(f"/macros/{macro_id}/execute", json={"account_ids": [account_id]})
        log_id = exec_resp.json()["execution_id"]
        log_resp = await auth_client.get(f"/logs/{log_id}")
        log = log_resp.json()
        assert "executed_at" in log
        assert isinstance(log["executed_at"], str)
        assert "result" in log
        # O resultado deve ser uma string (por exemplo, "success" ou erro)
        assert isinstance(log["result"], str)