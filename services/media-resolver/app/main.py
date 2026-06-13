import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .resolver import ResolverError, resolve_social_url


class ResolveRequest(BaseModel):
    url: str = Field(min_length=1)
    platform: str | None = None


app = FastAPI(title="Content Engine Media Resolver")


def require_api_key(authorization: str | None) -> None:
    expected = os.environ.get("MEDIA_RESOLVER_API_KEY")
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid resolver API key")


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok"}


@app.post("/resolve")
def resolve(
    request: ResolveRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_api_key(authorization)
    try:
        return resolve_social_url(request.url, request.platform).to_dict()
    except ResolverError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "message": str(exc),
                "code": exc.code,
                "platform": exc.platform,
            },
        ) from exc
