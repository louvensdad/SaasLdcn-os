from abc import ABC, abstractmethod
from typing import List
from app.account.schemas import CreateAccountRequest, UpdateAccountRequest, AccountResponse


class AccountPort(ABC):
    @abstractmethod
    async def list_accounts(self, user_id: str) -> List[AccountResponse]: ...

    @abstractmethod
    async def get_account(self, account_id: str, user_id: str) -> AccountResponse: ...

    @abstractmethod
    async def create_account(self, request: CreateAccountRequest, user_id: str) -> AccountResponse: ...

    @abstractmethod
    async def update_account(self, account_id: str, request: UpdateAccountRequest, user_id: str) -> AccountResponse: ...

    @abstractmethod
    async def delete_account(self, account_id: str, user_id: str) -> None: ...