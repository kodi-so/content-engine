# Platform Post Compiler Presets

The Post Compiler is the boundary between creative generation and distribution.
Upstream nodes should produce media, captions, slideshow specs, scripts, or
metadata without needing to know every platform's packaging rules.

The compiler now stores platform-aware package metadata on each
`publish_payload` artifact:

- `primaryPlatformPreset`: the main optimization target.
- `platformPresets`: the preset definitions used for the package.
- `platformPackages`: one package view per target platform/surface.
- `optimizeForPlatforms`: normalized platform IDs used by export and posting
  nodes.
- `platformSettings`: merged settings, including primary platform, surface,
  aspect ratio, caption limit, and hashtag guidance.

## Current Presets

| Preset | Platform | Surface | Best For |
| --- | --- | --- | --- |
| TikTok vertical video | TikTok | For You | Vertical videos and TikTok-style slideshows |
| Instagram Reel | Instagram | Reels | Vertical short-form videos |
| Instagram carousel | Instagram | Carousel | Image carousels and slideshow-style posts |
| YouTube Shorts | YouTube | Shorts | Vertical videos under Shorts assumptions |
| X video | X | Timeline | Compact video or image posts |
| X thread | X | Thread | Multi-post text/media threads |
| LinkedIn video | LinkedIn | Feed | Professional video or image posts |
| LinkedIn document | LinkedIn | Document | Carousel/document-style educational posts |
| Facebook Reel | Facebook | Reels | Future vertical reel route |
| Threads post | Threads | Feed | Future conversational post/thread route |
| Pinterest idea pin | Pinterest | Idea pin | Future visual-first idea pin route |

## Workflow Behavior

- Post Compiler nodes default to TikTok vertical video.
- A workflow can choose a different `platformPreset` without changing upstream
  generation nodes.
- `optimizeForPlatforms` may contain platform IDs or preset IDs. The runner
  resolves those into concrete platform packages.
- If no preset is configured, the runner chooses a default based on post type:
  video and slideshow use TikTok, carousel uses Instagram carousel, and thread
  uses X thread.
- Export and Auto Post consume the compiled package. They should not re-create
  platform optimization rules.
