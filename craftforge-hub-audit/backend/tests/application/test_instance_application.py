import pytest
from unittest.mock import AsyncMock, MagicMock
from app.instance.application.list_instances import ListInstancesUseCase
from app.instance.application.get_instance import GetInstanceUseCase
from app.instance.application.start_instance import StartInstanceUseCase, StartInstanceInput
from app.instance.application.stop_instance import StopInstanceUseCase, StopInstanceInput
from app.instance.application.start_all_instances import StartAllInstancesUseCase
from app.instance.application.instance_policy_service import InstancePolicyService


@pytest.fixture
def instance_repo():
    repo = MagicMock()
    repo.find_by_user_id = AsyncMock()
    repo.find_by_id = AsyncMock()
    repo.update = AsyncMock()
    repo.count_active_by_user_id = AsyncMock()
    return repo


@pytest.fixture
def user_repo():
    repo = MagicMock()
    repo.find_by_id = AsyncMock()
    return repo


@pytest.fixture
def policy_service(user_repo, instance_repo):
    return InstancePolicyService(user_repository=user_repo, instance_repository=instance_repo)


class TestListInstances:
    async def test_list_instances(self, instance_repo):
        inst_mock = MagicMock()
        inst_mock.id = "inst-1"
        inst_mock.account_id = "acc-1"
        inst_mock.status = "online"
        inst_mock.fps = 60.0
        inst_mock.ram = 2048.0
        instance_repo.find_by_user_id.return_value = [inst_mock]

        use_case = ListInstancesUseCase(instance_repository=instance_repo)
        output = await use_case.execute("user-123")
        assert len(output.instances) == 1
        assert output.instances[0].fps == 60.0


class TestGetInstance:
    async def test_get_instance_success(self, instance_repo):
        inst_mock = MagicMock()
        inst_mock.id = "inst-1"
        inst_mock.account_id = "acc-1"
        inst_mock.status = "offline"
        inst_mock.fps = 0.0
        inst_mock.ram = 0.0
        instance_repo.find_by_id.return_value = inst_mock

        use_case = GetInstanceUseCase(instance_repository=instance_repo)
        output = await use_case.execute("inst-1", "user-123")
        assert output.instance_id == "inst-1"
        assert output.status == "offline"


class TestStartInstance:
    async def test_start_instance_success(self, instance_repo, policy_service):
        inst_mock = MagicMock()
        inst_mock.id = "inst-1"
        inst_mock.status = "offline"
        instance_repo.find_by_id.return_value = inst_mock
        policy_service._user_repository.find_by_id.return_value = MagicMock(plan="free")
        policy_service._instance_repository.count_active_by_user_id.return_value = 0

        use_case = StartInstanceUseCase(instance_repository=instance_repo, policy_service=policy_service)
        input_dto = StartInstanceInput(instance_id="inst-1", user_id="user-123")
        output = await use_case.execute(input_dto)
        assert output.status == "online"
        instance_repo.update.assert_awaited_once()

    async def test_start_instance_already_online(self, instance_repo, policy_service):
        inst_mock = MagicMock()
        inst_mock.status = "online"
        instance_repo.find_by_id.return_value = inst_mock

        use_case = StartInstanceUseCase(instance_repository=instance_repo, policy_service=policy_service)
        input_dto = StartInstanceInput(instance_id="inst-1", user_id="user-123")
        with pytest.raises(ValueError, match="Já está online"):
            await use_case.execute(input_dto)


class TestStopInstance:
    async def test_stop_instance_success(self, instance_repo):
        inst_mock = MagicMock()
        inst_mock.id = "inst-1"
        inst_mock.status = "online"
        instance_repo.find_by_id.return_value = inst_mock

        use_case = StopInstanceUseCase(instance_repository=instance_repo)
        input_dto = StopInstanceInput(instance_id="inst-1", user_id="user-123")
        output = await use_case.execute(input_dto)
        assert output.status == "offline"
        instance_repo.update.assert_awaited_once()


class TestStartAllInstances:
    async def test_start_all_success(self, instance_repo, policy_service):
        inst1 = MagicMock()
        inst1.id = "inst-1"
        inst1.status = "offline"
        inst2 = MagicMock()
        inst2.id = "inst-2"
        inst2.status = "offline"
        instance_repo.find_by_user_id.return_value = [inst1, inst2]
        policy_service._user_repository.find_by_id.return_value = MagicMock(plan="pro")
        policy_service._instance_repository.count_active_by_user_id.return_value = 0

        use_case = StartAllInstancesUseCase(instance_repository=instance_repo, policy_service=policy_service)
        output = await use_case.execute("user-123")
        assert len(output.started) == 2
        assert len(output.failed) == 0