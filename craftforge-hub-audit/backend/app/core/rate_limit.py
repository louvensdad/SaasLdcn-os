from abc import ABC, abstractmethod
from typing import Optional
import time
from collections import deque
import re


class RateLimiter(ABC):
    """Abstract base rate limiter."""

    @abstractmethod
    async def check(self, key: str, limit: str) -> tuple[bool, Optional[int]]:
        """Return (allowed: bool, retry_after: Optional[int in seconds])"""
        ...


def parse_limit(limit: str) -> tuple[int, int]:
    """Parse 'N/period' into (max_requests, period_seconds). Period examples: minute, hour, second."""
    match = re.match(r"(\d+)/(\w+)", limit)
    if not match:
        raise ValueError(f"Invalid rate limit format: {limit}. Use '<count>/<period>' (e.g., 100/minute)")
    count = int(match.group(1))
    period_str = match.group(2)
    multipliers = {
        "second": 1,
        "minute": 60,
        "hour": 3600,
        "day": 86400,
    }
    if period_str not in multipliers:
        raise ValueError(f"Unsupported period '{period_str}'. Use one of: second, minute, hour, day")
    return count, multipliers[period_str]


class InMemoryRateLimiter(RateLimiter):
    """Simple in-memory sliding window rate limiter."""

    def __init__(self):
        self._windows: dict[str, deque] = {}

    async def check(self, key: str, limit: str) -> tuple[bool, Optional[int]]:
        max_req, period = parse_limit(limit)
        now = time.time()
        if key not in self._windows:
            self._windows[key] = deque()

        window = self._windows[key]
        # Remove outdated timestamps
        while window and window[0] <= now - period:
            window.popleft()

        if len(window) < max_req:
            window.append(now)
            return True, None
        else:
            # Retry after = (oldest timestamp + period) - now
            retry_after = int((window[0] + period) - now) + 1
            return False, retry_after


class RedisRateLimiter(RateLimiter):
    """Distributed rate limiter using Redis. Placeholder – real implementation requires aioredis."""

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        # In a real implementation, connect to Redis here
        raise NotImplementedError("Redis rate limiter not implemented yet. Use InMemoryRateLimiter.")

    async def check(self, key: str, limit: str) -> tuple[bool, Optional[int]]:
        raise NotImplementedError