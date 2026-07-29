from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.exceptions import global_exception_handler, AppException
from app.core.middleware import setup_middlewares
from app.core.logging import setup_logging
import uvicorn

# Setup logging
logger = setup_logging()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# Register middlewares
setup_middlewares(app)

# Register global exception handler
app.add_exception_handler(Exception, global_exception_handler)  # type: ignore[arg-type]

# Health check endpoint (optional, for readiness)
@app.get("/health")
async def health_check():
    return {"status": "ok", "version": settings.app_version}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )