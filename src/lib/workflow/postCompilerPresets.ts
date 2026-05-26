export type PostCompilerPresetId =
  | "tiktok_vertical_video"
  | "instagram_reel"
  | "instagram_carousel"
  | "youtube_shorts"
  | "x_video"
  | "x_thread"
  | "linkedin_video"
  | "linkedin_document"
  | "facebook_reel"
  | "threads_post"
  | "pinterest_idea_pin";

export type PostCompilerPreset = {
  id: PostCompilerPresetId;
  label: string;
  platform: string;
  surface: string;
  postTypes: string[];
  aspectRatios: string[];
  mediaTypes: string[];
  maxDurationSeconds?: number;
  captionMaxCharacters?: number;
  defaultHashtagCount?: number;
  notes: string[];
};

export const POST_COMPILER_PRESETS: PostCompilerPreset[] = [
  {
    id: "tiktok_vertical_video",
    label: "TikTok vertical video",
    platform: "tiktok",
    surface: "for_you",
    postTypes: ["video", "slideshow"],
    aspectRatios: ["9:16"],
    mediaTypes: ["video", "slideshow"],
    maxDurationSeconds: 180,
    captionMaxCharacters: 2200,
    defaultHashtagCount: 4,
    notes: ["Prioritize a fast hook, native vertical framing, and safe caption space."],
  },
  {
    id: "instagram_reel",
    label: "Instagram Reel",
    platform: "instagram",
    surface: "reels",
    postTypes: ["video"],
    aspectRatios: ["9:16"],
    mediaTypes: ["video"],
    maxDurationSeconds: 90,
    captionMaxCharacters: 2200,
    defaultHashtagCount: 6,
    notes: ["Keep the main subject centered and leave room for UI overlays."],
  },
  {
    id: "instagram_carousel",
    label: "Instagram carousel",
    platform: "instagram",
    surface: "carousel",
    postTypes: ["carousel", "slideshow", "single_image"],
    aspectRatios: ["4:5", "1:1"],
    mediaTypes: ["image", "slideshow"],
    captionMaxCharacters: 2200,
    defaultHashtagCount: 6,
    notes: ["Use slide one as the hook and keep text readable at feed size."],
  },
  {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    platform: "youtube",
    surface: "shorts",
    postTypes: ["video"],
    aspectRatios: ["9:16"],
    mediaTypes: ["video"],
    maxDurationSeconds: 60,
    captionMaxCharacters: 100,
    defaultHashtagCount: 3,
    notes: ["Treat title/caption as search-facing metadata, not just social copy."],
  },
  {
    id: "x_video",
    label: "X video",
    platform: "x",
    surface: "timeline",
    postTypes: ["video", "single_image"],
    aspectRatios: ["16:9", "1:1", "9:16"],
    mediaTypes: ["video", "image"],
    maxDurationSeconds: 140,
    captionMaxCharacters: 280,
    defaultHashtagCount: 1,
    notes: ["Write compact copy that stands alone without relying on hashtags."],
  },
  {
    id: "x_thread",
    label: "X thread",
    platform: "x",
    surface: "thread",
    postTypes: ["thread"],
    aspectRatios: ["1:1", "16:9"],
    mediaTypes: ["text", "image", "video"],
    captionMaxCharacters: 280,
    defaultHashtagCount: 0,
    notes: ["Compile as ordered short posts with one clear idea per post."],
  },
  {
    id: "linkedin_video",
    label: "LinkedIn video",
    platform: "linkedin",
    surface: "feed",
    postTypes: ["video", "single_image"],
    aspectRatios: ["1:1", "4:5", "16:9"],
    mediaTypes: ["video", "image"],
    maxDurationSeconds: 600,
    captionMaxCharacters: 3000,
    defaultHashtagCount: 3,
    notes: ["Bias toward professional framing, explicit takeaway, and credibility."],
  },
  {
    id: "linkedin_document",
    label: "LinkedIn document",
    platform: "linkedin",
    surface: "document",
    postTypes: ["carousel", "slideshow"],
    aspectRatios: ["1:1", "4:5"],
    mediaTypes: ["slideshow", "image"],
    captionMaxCharacters: 3000,
    defaultHashtagCount: 3,
    notes: ["Package slides as a document-style carousel with a clear title slide."],
  },
  {
    id: "facebook_reel",
    label: "Facebook Reel",
    platform: "facebook",
    surface: "reels",
    postTypes: ["video"],
    aspectRatios: ["9:16"],
    mediaTypes: ["video"],
    maxDurationSeconds: 90,
    captionMaxCharacters: 2200,
    defaultHashtagCount: 4,
    notes: ["Future route: optimize like a vertical reel while publishing support matures."],
  },
  {
    id: "threads_post",
    label: "Threads post",
    platform: "threads",
    surface: "feed",
    postTypes: ["thread", "single_image", "video"],
    aspectRatios: ["1:1", "4:5", "9:16"],
    mediaTypes: ["text", "image", "video"],
    captionMaxCharacters: 500,
    defaultHashtagCount: 0,
    notes: ["Future route: keep language conversational and low-friction."],
  },
  {
    id: "pinterest_idea_pin",
    label: "Pinterest idea pin",
    platform: "pinterest",
    surface: "idea_pin",
    postTypes: ["carousel", "slideshow", "video"],
    aspectRatios: ["2:3", "9:16"],
    mediaTypes: ["image", "slideshow", "video"],
    maxDurationSeconds: 60,
    captionMaxCharacters: 500,
    defaultHashtagCount: 4,
    notes: ["Future route: make each visual useful without needing audio."],
  },
];

export const DEFAULT_POST_COMPILER_PRESET_ID: PostCompilerPresetId = "tiktok_vertical_video";

export function postCompilerPresetIds(): PostCompilerPresetId[] {
  return POST_COMPILER_PRESETS.map((preset) => preset.id);
}

export function getPostCompilerPreset(id?: string): PostCompilerPreset {
  return (
    POST_COMPILER_PRESETS.find((preset) => preset.id === id) ??
    POST_COMPILER_PRESETS.find((preset) => preset.id === DEFAULT_POST_COMPILER_PRESET_ID) ??
    POST_COMPILER_PRESETS[0]
  );
}
