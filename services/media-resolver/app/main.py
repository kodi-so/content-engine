import logging
import os
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .resolver import ResolverError, resolve_social_url

logger = logging.getLogger("content-engine.media-resolver")


class ResolveRequest(BaseModel):
    url: str = Field(min_length=1)
    platform: str | None = None


app = FastAPI(title="Content Engine Media Resolver")


def source_host_for_log(url: str) -> str:
    try:
        return urlparse(url).hostname or "unknown-host"
    except Exception:
        return "invalid-url"


def resolved_summary(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": payload.get("status"),
        "mediaType": payload.get("mediaType", "media"),
        "platform": payload.get("platform"),
        "hasMediaUrl": bool(payload.get("mediaUrl")),
        "mimeType": payload.get("mimeType"),
        "byteLength": payload.get("byteLength"),
        "durationSeconds": payload.get("durationSeconds"),
        "slideCount": len(payload.get("slides") or []),
        "hasAudio": bool(payload.get("audio")),
    }


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
    logger.info(
        "resolve_start platform=%s host=%s",
        request.platform,
        source_host_for_log(request.url),
    )
    try:
        payload = resolve_social_url(request.url, request.platform).to_dict()
        logger.info("resolve_complete summary=%s", resolved_summary(payload))
        return payload
    except ResolverError as exc:
        logger.exception(
            "resolve_failed platform=%s host=%s code=%s",
            exc.platform or request.platform,
            source_host_for_log(request.url),
            exc.code,
        )
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "message": str(exc),
                "code": exc.code,
                "platform": exc.platform,
            },
        ) from exc
