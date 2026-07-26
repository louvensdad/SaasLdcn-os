import sys
from loguru import logger
from app.core.config import settings


def setup_logging():
    """Configure loguru for structured JSON or plain console logging."""
    logger.remove()  # Remove default handler
    fmt = (
        "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {name}:{function}:{line} | {message}"
        if not settings.json_logs
        else "{message}"
    )
    logger.add(
        sys.stdout,
        level=settings.log_level,
        format=fmt,
        serialize=settings.json_logs,
        backtrace=settings.debug,
        diagnose=settings.debug,
    )
    return logger


# Assign to app logger
logger = setup_logging()