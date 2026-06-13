from __future__ import annotations

import ipaddress
import json
import os
import socket
import sys
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import yt_dlp
from curl_cffi import requests as cffi_requests


SUPPORTED_PLATFORMS = {"tiktok", "instagram", "facebook"}
SOCIAL_HOST_MARKERS = {
    "tiktok": ("tiktok.com", "vm.tiktok.com", "vt.tiktok.com"),
    "instagram": ("instagram.com", "www.instagram.com"),
    "facebook": ("facebook.com", "www.facebook.com", "fb.watch", "m.facebook.com"),
}
MAX_MEDIA_BYTES = int(os.environ.get("MAX_MEDIA_BYTES", str(100 * 1024 * 1024)))
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
UNSUPPORTED_VIDEO_CODEC_MARKERS = ("bvc2", "bytevc2")


class ResolverError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "resolver_error",
        platform: str | None = None,
        status_code: int = 422,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.platform = platform
        self.status_code = status_code


@dataclass
class ResolvedMedia:
    platform: str
    source_url: str
    media_url: str
    mime_type: str = "video/mp4"
    file_name: str = "social-media.mp4"
    byte_length: int | None = None
    duration_seconds: float | None = None
    request_headers: dict[str, str] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "resolved",
            "platform": self.platform,
            "sourceUrl": self.source_url,
            "mediaUrl": self.media_url,
            "mimeType": self.mime_type,
            "fileName": self.file_name,
            "byteLength": self.byte_length,
            "durationSeconds": self.duration_seconds,
            "requestHeaders": self.request_headers,
            "metadata": self.metadata,
        }


def detect_platform(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    for platform, markers in SOCIAL_HOST_MARKERS.items():
        if any(marker == host or host.endswith(f".{marker}") for marker in markers):
            return platform
    return "unknown"


def assert_public_social_url(url: str, platform_hint: str | None = None) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ResolverError("Only https URLs are supported", code="invalid_url")
    if not parsed.hostname:
        raise ResolverError("URL has no hostname", code="invalid_url")

    platform = (platform_hint or detect_platform(url)).lower()
    if platform not in SUPPORTED_PLATFORMS:
        raise ResolverError(
            "Supported social URLs are TikTok, Instagram, and Facebook",
            code="unsupported_platform",
            platform=platform,
        )

    host = parsed.hostname.lower()
    markers = SOCIAL_HOST_MARKERS[platform]
    if not any(marker == host or host.endswith(f".{marker}") for marker in markers):
        raise ResolverError("URL host does not match the requested platform", code="host_mismatch", platform=platform)

    try:
        for info in socket.getaddrinfo(host, None):
            address = info[4][0]
            ip = ipaddress.ip_address(address)
            if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
                raise ResolverError("URL resolves to a blocked network address", code="blocked_host", platform=platform)
    except socket.gaierror:
        raise ResolverError("Could not resolve URL hostname", code="dns_failed", platform=platform) from None

    return platform


def media_extension(mime_type: str) -> str:
    if mime_type.startswith("image/"):
        return mime_type.split("/", 1)[1].replace("jpeg", "jpg")
    if mime_type == "audio/mpeg":
        return "mp3"
    if mime_type.startswith("audio/"):
        return mime_type.split("/", 1)[1]
    return "mp4"


def metadata_from_tikwm_author(data: dict[str, Any]) -> dict[str, Any]:
    author = data.get("author") if isinstance(data.get("author"), dict) else {}
    return {
        "title": data.get("title"),
        "uploader": author.get("unique_id") or author.get("nickname"),
        "source": "tikwm",
        "id": data.get("id"),
    }


def resolve_tiktok_with_tikwm(url: str) -> ResolvedMedia | None:
    try:
        response = cffi_requests.post(
            "https://www.tikwm.com/api/",
            data={"url": url, "hd": "1"},
            impersonate="chrome",
            timeout=30,
            headers={"User-Agent": USER_AGENT},
        )
        payload = response.json()
    except Exception:
        return None

    if payload.get("code") != 0 or not isinstance(payload.get("data"), dict):
        return None

    data = payload["data"]
    media_url = data.get("hdplay") or data.get("play") or data.get("wmplay")
    if not isinstance(media_url, str) or not media_url.startswith("https://"):
        return None

    byte_length = data.get("hd_size") or data.get("size") or data.get("wm_size")
    if isinstance(byte_length, (int, float)) and byte_length > MAX_MEDIA_BYTES:
        raise ResolverError("Resolved TikTok media is too large", code="media_too_large", platform="tiktok")

    video_id = str(data.get("id") or "tiktok")
    return ResolvedMedia(
        platform="tiktok",
        source_url=url,
        media_url=media_url,
        mime_type="video/mp4",
        file_name=f"{video_id}.mp4",
        byte_length=int(byte_length) if isinstance(byte_length, (int, float)) else None,
        duration_seconds=float(data["duration"]) if isinstance(data.get("duration"), (int, float)) else None,
        request_headers={"User-Agent": USER_AGENT},
        metadata=metadata_from_tikwm_author(data),
    )


def safe_tiktok_selector() -> str:
    return (
        "b[ext=mp4][vcodec^=h264]/"
        "b[ext=mp4][vcodec^=avc1]/"
        "b[ext=mp4][vcodec^=h265]/"
        "b[ext=mp4][vcodec^=hvc1]/"
        "b[ext=mp4][vcodec^=hev1]/"
        "b[ext=mp4][vcodec^=hevc]/"
        "b[ext=mp4][vcodec!*=bvc][vcodec!*=bytevc2]"
    )


def yt_dlp_options(platform: str) -> dict[str, Any]:
    if platform == "tiktok":
        fmt = safe_tiktok_selector()
        format_sort = ["+codec:avc:m4a", "res", "ext:mp4:m4a"]
    elif platform == "instagram":
        fmt = "best[filesize<100M]/bestvideo[filesize<100M]+bestaudio/bestvideo+bestaudio/best"
        format_sort = None
    else:
        fmt = "best[vcodec^=h264][filesize<100M]/best[vcodec^=h264]/best[filesize<100M]/best"
        format_sort = None

    options: dict[str, Any] = {
        "download": False,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 30 if platform in {"tiktok", "instagram"} else 90,
        "format": fmt,
    }
    if format_sort:
        options["format_sort"] = format_sort
    if platform in {"tiktok", "instagram"}:
        try:
            from yt_dlp.networking.impersonate import ImpersonateTarget

            options["impersonate"] = ImpersonateTarget.from_str("chrome")
        except Exception:
            pass
    return options


def format_score(item: dict[str, Any]) -> int:
    value = " ".join(
        str(item.get(key) or "").lower()
        for key in ("url", "ext", "vcodec", "acodec", "format_id", "format_note")
    )
    if not item.get("url"):
        return -10_000
    if any(marker in value for marker in UNSUPPORTED_VIDEO_CODEC_MARKERS):
        return -2_000

    score = 0
    if item.get("vcodec") not in (None, "none"):
        score += 100
    if str(item.get("ext") or "").lower() == "mp4":
        score += 80
    if str(item.get("vcodec") or "").lower().startswith(("h264", "avc1", "h265", "hvc1", "hev1", "hevc")):
        score += 40
    filesize = item.get("filesize") or item.get("filesize_approx")
    if isinstance(filesize, (int, float)) and filesize <= MAX_MEDIA_BYTES:
        score += 20
    if isinstance(item.get("height"), int):
        score += min(item["height"], 1080) // 90
    return score


def choose_media_format(info: dict[str, Any]) -> dict[str, Any]:
    if isinstance(info.get("url"), str):
        return info
    formats = [item for item in info.get("formats") or [] if isinstance(item, dict)]
    if not formats:
        raise ResolverError("yt-dlp did not return playable formats", code="no_formats")
    chosen = max(formats, key=format_score)
    if format_score(chosen) < 0 or not isinstance(chosen.get("url"), str):
        raise ResolverError("yt-dlp did not return a supported media URL", code="no_supported_format")
    return chosen


def resolve_with_ytdlp(url: str, platform: str) -> ResolvedMedia:
    try:
        with yt_dlp.YoutubeDL(yt_dlp_options(platform)) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise ResolverError(f"yt-dlp failed to resolve media: {exc}", code="ytdlp_failed", platform=platform, status_code=502) from exc

    if not isinstance(info, dict):
        raise ResolverError("yt-dlp returned no metadata", code="ytdlp_no_metadata", platform=platform, status_code=502)

    selected = choose_media_format(info)
    media_url = selected.get("url")
    if not isinstance(media_url, str) or not media_url.startswith("https://"):
        raise ResolverError("Resolved media URL is invalid", code="invalid_media_url", platform=platform, status_code=502)

    filesize = selected.get("filesize") or selected.get("filesize_approx") or info.get("filesize") or info.get("filesize_approx")
    if isinstance(filesize, (int, float)) and filesize > MAX_MEDIA_BYTES:
        raise ResolverError("Resolved media is too large", code="media_too_large", platform=platform)

    mime_type = "video/mp4"
    ext = str(selected.get("ext") or info.get("ext") or "mp4").lower()
    if ext in {"jpg", "jpeg", "png", "webp"}:
        mime_type = f"image/{'jpeg' if ext == 'jpg' else ext}"
    elif selected.get("vcodec") in (None, "none") and selected.get("acodec") not in (None, "none"):
        mime_type = "audio/mpeg" if ext == "mp3" else f"audio/{ext}"

    media_id = str(info.get("id") or platform)
    request_headers = {
        key: str(value)
        for key, value in (info.get("http_headers") or selected.get("http_headers") or {}).items()
        if isinstance(key, str) and isinstance(value, (str, int, float))
    }
    request_headers.setdefault("User-Agent", USER_AGENT)

    return ResolvedMedia(
        platform=platform,
        source_url=url,
        media_url=media_url,
        mime_type=mime_type,
        file_name=f"{media_id}.{media_extension(mime_type)}",
        byte_length=int(filesize) if isinstance(filesize, (int, float)) else None,
        duration_seconds=float(info["duration"]) if isinstance(info.get("duration"), (int, float)) else None,
        request_headers=request_headers,
        metadata={
            "title": info.get("title"),
            "uploader": info.get("uploader") or info.get("channel"),
            "source": "yt-dlp",
            "id": info.get("id"),
            "formatId": selected.get("format_id"),
            "ext": ext,
        },
    )


def resolve_social_url(url: str, platform_hint: str | None = None) -> ResolvedMedia:
    platform = assert_public_social_url(url, platform_hint)
    if platform == "tiktok":
        resolved = resolve_tiktok_with_tikwm(url)
        if resolved:
            return resolved
    return resolve_with_ytdlp(url, platform)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python app/resolver.py <social-url>")
    result = resolve_social_url(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(json.dumps(result.to_dict(), indent=2))
