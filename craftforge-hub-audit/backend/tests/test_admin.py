import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

class TestAdminUsers:
    async def test_list_users_as_admin(self, admin_client: AsyncClient):
        response = await admin_client.get("/admin/users")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Deve incluir pelo menos o admin e o normal_user
        assert len(data) >= 2

    async def test_list_users_as_normal_user_fails(self, auth_client: AsyncClient):
        response = await auth_client.get("/admin/users")
        assert response.status_code == 403

    async def test_get_user_by_id_as_admin(self, admin_client: AsyncClient, normal_user: User):
        # Como o normal_user foi criado via fixture, devemos obter seu ID
        response = await admin_client.get(f"/admin/users/{normal_user.id}")
        assert response.status_code == 200
        assert response.json()["id"] == normal_user.id

    async def test_get_user_by_id_not_found(self, admin_client: AsyncClient):
        response = await admin_client.get("/admin/users/99999")
        assert response.status_code == 404

    async def test_normal_user_cannot_access_admin_endpoint(self, auth_client: AsyncClient):
        response = await auth_client.get("/admin/users/1")
        assert response.status_code == 403