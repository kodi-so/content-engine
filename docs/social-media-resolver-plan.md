# Social Media Resolver Plan

## Status

Implemented locally:

- `services/media-resolver/` contains the Railway-ready Python/FastAPI resolver.
- `convex/analyze/mediaResolver.ts` contains the Convex adapter.
- Analyze URL execution now routes TikTok, Instagram, Facebook, and direct media
  URLs through the resolver/direct-download path before Gemini upload.
- The exact TikTok test URL resolves locally through the HTTP resolver and the
  returned media URL downloads as `video/mp4`.

Still needed:

- Create/deploy the Railway service.
- Set `MEDIA_RESOLVER_URL` and `MEDIA_RESOLVER_API_KEY` in Convex.
- Run an end-to-end deployed Analyze job after those env vars are configured.
- Test live Instagram and Facebook examples; initial support uses the same
  resolver interface via `yt-dlp`.

## Decision

Use a small Railway-hosted Python resolver service for social media URL ingestion.

Content Engine should keep Convex as the analysis orchestrator and source of truth, but move platform-specific media acquisition out of Convex. The resolver's job is to turn a TikTok, Instagram, or Facebook post URL into actual downloadable media metadata or bytes, then let the existing agent source-analysis pipeline upload that media to Gemini.

## Why This Exists

Agent source analysis supports pasted social URLs, but direct Gemini URL analysis only works reliably for YouTube. TikTok, Instagram, and Facebook usually require a download/resolve step first.

The Codex `video-analyzer` MCP proved this is possible for the test TikTok URL:

```text
https://www.tiktok.com/@errobweuc0t/video/7649089152134155550
```

That tool does not simply pass the TikTok URL to Gemini. It downloads or resolves the social media first, uploads the resulting media file(s) to Gemini, and then runs analysis.

Local reference implementation found here:

```text
/Users/gabeliss/Library/Python/3.11/lib/python/site-packages/video_url_analyzer_mcp
```

Useful implementation clues:

- `server.py` uses `yt_dlp` for regular TikTok/Instagram downloads.
- `slideshow.py` handles TikTok/Instagram photo/carousel cases.
- TikTok slideshow fallback calls `https://www.tikwm.com/api/` via `curl_cffi`.
- YouTube is still analyzed directly by Gemini using the URL as `file_uri`.

## Recommended Architecture

```text
Analyze page
  -> Convex create analysis job
  -> Convex internal action
  -> Railway media resolver
  -> Convex/Gemini upload analysis path
  -> Convex saves result
```

Keep the boundary provider-based:

```ts
resolveSocialMedia(url) -> {
  mediaUrl?: string;
  mediaBytes?: ArrayBuffer;
  mimeType: string;
  fileName: string;
  byteLength?: number;
  metadata?: Record<string, unknown>;
}
```

This lets the resolver start on Railway and move to AWS later without changing the product flow.

## Why Railway

Railway is the best pragmatic host for this specific feature:

- Runs a normal Docker/Python service.
- Supports `yt-dlp`, `curl_cffi`, and `ffmpeg` cleanly.
- Easier temp-file handling than serverless functions.
- Local dev and production behavior are similar.
- Less infrastructure ceremony than AWS.

AWS Lambda container or App Runner is the likely hardening path if this becomes high-volume or compliance-sensitive. Vercel Python is acceptable for an MVP, but less natural for subprocess-heavy downloaders. Cloudflare Workers are not a good primary fit because classic Workers are isolate-based and not suited to running `yt-dlp`/`ffmpeg`.

## Resolver Service Shape

Suggested service: FastAPI.

Endpoints:

```http
GET /health
POST /resolve
```

`POST /resolve` input:

```json
{
  "url": "https://www.tiktok.com/@errobweuc0t/video/7649089152134155550",
  "platform": "tiktok"
}
```

Preferred output:

```json
{
  "status": "resolved",
  "platform": "tiktok",
  "sourceUrl": "https://www.tiktok.com/@errobweuc0t/video/7649089152134155550",
  "mediaUrl": "https://...",
  "mimeType": "video/mp4",
  "fileName": "7649089152134155550.mp4",
  "byteLength": 510180,
  "durationSeconds": 6,
  "metadata": {
    "title": "...",
    "uploader": "..."
  }
}
```

If returning `mediaUrl` proves brittle because signed URLs expire quickly, switch the contract to return bytes through one of these approaches:

- Resolver uploads media to Convex storage through a signed upload URL provided by Convex.
- Resolver uploads media to object storage and returns a short-lived URL.
- Convex calls resolver and streams/downloads the response body directly.

## Security

Protect the resolver with a shared secret.

Convex request header:

```text
Authorization: Bearer ${MEDIA_RESOLVER_API_KEY}
```

Railway env vars:

```text
MEDIA_RESOLVER_API_KEY=...
MAX_MEDIA_BYTES=104857600
```

Convex env vars:

```text
MEDIA_RESOLVER_URL=https://...
MEDIA_RESOLVER_API_KEY=...
```

Resolver must validate URLs before download:

- Allow only `https`.
- Allow only supported platform hosts and known media CDN hosts.
- Block localhost/private/reserved IPs.
- Enforce max byte size before and after download.
- Use timeouts.

## Implementation Steps

1. Create `services/media-resolver/` with FastAPI, `yt-dlp`, `curl_cffi`, and optional `ffmpeg`. Done.
2. Add `/health` and `/resolve`. Done.
3. Implement TikTok regular video resolution first using TikWM fast path and `yt-dlp` fallback. Done.
4. Add Instagram and Facebook through the same resolver interface. Initial `yt-dlp` support added; needs live URL testing.
5. Deploy to Railway with `MEDIA_RESOLVER_API_KEY`.
6. Update Convex Analyze URL flow:
   - YouTube: keep direct Gemini URL path.
   - Direct media file URL: keep current fetch/upload path.
   - TikTok/Instagram/Facebook: call resolver, then reuse upload-to-Gemini analysis.
   Done.
7. Update Analyze UI copy. Done.
8. Test with the known TikTok URL above before shipping. Local resolver and media download verified; deployed Analyze job still pending.

## Deployment Checklist

Railway CLI is installed locally, but this repo was not linked to a Railway
project and the CLI was not authenticated during implementation. To deploy:

1. Log in or provide a Railway token:

   ```sh
   railway login
   ```

2. Create or link a Railway project/service for the resolver:

   ```sh
   railway link
   ```

3. Set the resolver secret on Railway:

   ```sh
   railway variables --set "MEDIA_RESOLVER_API_KEY=<shared-secret>"
   railway variables --set "MAX_MEDIA_BYTES=104857600"
   ```

4. Deploy the service from its subdirectory:

   ```sh
   railway up services/media-resolver --path-as-root
   ```

5. Copy the deployed Railway URL and configure Convex:

   ```sh
   npx convex env set MEDIA_RESOLVER_URL "https://<resolver>.up.railway.app"
   npx convex env set MEDIA_RESOLVER_API_KEY "<shared-secret>"
   ```

6. Run an Analyze job with the known TikTok URL in production/staging and confirm
   the job completes.

## Acceptance Tests

Must pass before calling this complete:

- The known TikTok test URL resolves and analyzes through the agent source-analysis tool.
- A bad/private URL is rejected before any fetch.
- A too-large media response fails with a clear message.
- YouTube URL analysis still works.
- Manual upload analysis still works.
- Instagram/Facebook failures show clear upload fallback messaging.
- Resolver logs enough context to debug platform failures without logging secrets.

## Future Thread Prompt

Use this to resume:

```text
Please implement the Railway social media resolver from docs/social-media-resolver-plan.md.
Use the local Codex analyzer package at /Users/gabeliss/Library/Python/3.11/lib/python/site-packages/video_url_analyzer_mcp as a behavioral reference, especially its yt-dlp download path.
Start with TikTok and verify this URL works end-to-end in Content Engine:
https://www.tiktok.com/@errobweuc0t/video/7649089152134155550
Do not rely on HTML scraping as the primary path.
```
