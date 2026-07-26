import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

class TestMacroCRUD:
    async def test_create_macro(self, auth_client: AsyncClient):
        payload = {
            "name": "Macro de Farm",
            "script_content": "print('hello')",
            "description": "Automacao de farm",
        }
        response = await auth_client.post("/macros", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == payload["name"]
        assert "id" in data

    async def test_list_macros(self, auth_client: AsyncClient):
        await auth_client.post("/macros", json={"name": "M1", "script_content": "pass"})
        await auth_client.post("/macros", json={"name": "M2", "script_content": "pass"})
        response = await auth_client.get("/macros")
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_get_macro(self, auth_client: AsyncClient):
        create_resp = await auth_client.post("/macros", json={"name": "M1", "script_content": "pass"})
        macro_id = create_resp.json()["id"]
        response = await auth_client.get(f"/macros/{macro_id}")
        assert response.status_code == 200
        assert response.json()["id"] == macro_id

    async def test_update_macro(self, auth_client: AsyncClient):
        create_resp = await auth_client.post("/macros", json={"name": "Antigo", "script_content": "pass"})
        macro_id = create_resp.json()["id"]
        update_payload = {"name": "Novo Nome"}
        response = await auth_client.put(f"/macros/{macro_id}", json=update_payload)
        assert response.status_code == 200
        assert response.json()["name"] == "Novo Nome"

    async def test_delete_macro(self, auth_client: AsyncClient):
        create_resp = await auth_client.post("/macros", json={"name": "Del", "script_content": "pass"})
        macro_id = create_resp.json()["id"]
        response = await auth_client.delete(f"/macros/{macro_id}")
        assert response.status_code == 204

class TestMacroAssociationAndExecution:
    async def test_associate_macro_to_account(self, auth_client: AsyncClient):
        # Cria conta e macro
        account_resp = await auth_client.post("/accounts", json={"name": "Conta", "game_username": "j1", "password": "pwd"})
        account_id = account_resp.json()["id"]
        macro_resp = await auth_client.post("/macros", json={"name": "Macro", "script_content": "pass"})
        macro_id = macro_resp.json()["id"]
        # Associa
        response = await auth_client.post(f"/macros/{macro_id}/associate", json={"account_ids": [account_id]})
        assert response.status_code == 200
        # Verifica que a macro agora tem associação
        macro_detail = await auth_client.get(f"/macros/{macro_id}")
        assert len(macro_detail.json().get("associated_accounts", [])) > 0

    async def test_execute_macro_creates_log(self, auth_client: AsyncClient):
        # Setup
        account_resp = await auth_client.post("/accounts", json={"name": "Conta", "game_username": "j1", "password": "pwd"})
        account_id = account_resp.json()["id"]
        macro_resp = await auth_client.post("/macros", json={"name": "Macro", "script_content": "print('hello')"})
        macro_id = macro_resp.json()["id"]
        await auth_client.post(f"/macros/{macro_id}/associate", json={"account_ids": [account_id]})
        # Executa
        response = await auth_client.post(f"/macros/{macro_id}/execute", json={"account_ids": [account_id]})
        assert response.status_code == 200
        data = response.json()
        assert "execution_id" in data
        # Verifica se log foi criado
        log_resp = await auth_client.get(f"/logs/{data['execution_id']}")
        assert log_resp.status_code == 200
        assert log_resp.json()["macro_id"] == macro_id
        assert "result" in log_resp.json()

    async def test_execute_macro_without_association_fails(self, auth_client: AsyncClient):
        account_resp = await auth_client.post("/accounts", json={"name": "Conta", "game_username": "j1", "password": "pwd"})
        account_id = account_resp.json()["id"]
        macro_resp = await auth_client.post("/macros", json={"name": "Macro", "script_content": "pass"})
        macro_id = macro_resp.json()["id"]
        # Sem associação
        response = await auth_client.post(f"/macros/{macro_id}/execute", json={"account_ids": [account_id]})
        assert response.status_code == 400