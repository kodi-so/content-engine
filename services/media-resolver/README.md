# Media Resolver Service

Railway-hosted Python service for resolving TikTok, Instagram, and Facebook
post URLs into downloadable media URLs for Content Engine Analyze.

## Local Resolve Test

The resolver module can be tested without running FastAPI:

```bash
python3 app/resolver.py "https://www.tiktok.com/@errobweuc0t/video/7649089152134155550"
```

## HTTP API

```http
GET /health
POST /resolve
```

`POST /resolve`:

```json
{
  "url": "https://www.tiktok.com/@errobweuc0t/video/7649089152134155550",
  "platform": "tiktok"
}
```

Regular video posts resolve to a single `mediaUrl`. TikTok photo posts and
supported Instagram photo/carousel posts resolve to ordered slideshow media:

```json
{
  "status": "resolved",
  "mediaType": "slideshow",
  "platform": "tiktok",
  "sourceUrl": "https://www.tiktok.com/@example/photo/123",
  "slides": [
    {
      "url": "https://...",
      "mimeType": "image/jpeg",
      "fileName": "tiktok-slide-01.jpg",
      "metadata": { "slideIndex": 1 }
    }
  ],
  "audio": {
    "url": "https://...",
    "mimeType": "audio/mpeg",
    "fileName": "slideshow-audio.mp3"
  }
}
```

Set `MEDIA_RESOLVER_API_KEY` in Railway and in Convex. Convex sends it as:

```text
Authorization: Bearer ${MEDIA_RESOLVER_API_KEY}
```

Set `MAX_MEDIA_BYTES` to control the max accepted media size. The default is
`104857600` bytes.
