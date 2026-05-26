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

type PostCompilerPreset = {
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

const DEFAULT_PRESET_ID: PostCompilerPresetId = "tiktok_vertical_video";

const defaultPresetByPostType: Record<string, PostCompilerPresetId> = {
  carousel: "instagram_carousel",
  slideshow: "tiktok_vertical_video",
  single_image: "instagram_carousel",
  thread: "x_thread",
  video: "tiktok_vertical_video",
};

const defaultPresetByPlatform: Record<string, PostCompilerPresetId> = {
  facebook: "facebook_reel",
  instagram: "instagram_reel",
  linkedin: "linkedin_video",
  pinterest: "pinterest_idea_pin",
  threads: "threads_post",
  tiktok: "tiktok_vertical_video",
  x: "x_video",
  youtube: "youtube_shorts",
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stringListFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function presetForId(id: string | undefined): PostCompilerPreset | undefined {
  return POST_COMPILER_PRESETS.find((preset) => preset.id === id);
}

function presetIdForToken(token: string, postType: string): PostCompilerPresetId | undefined {
  if (presetForId(token)) return token as PostCompilerPresetId;

  if (token === "instagram" && (postType === "carousel" || postType === "slideshow")) {
    return "instagram_carousel";
  }
  if (token === "linkedin" && (postType === "carousel" || postType === "slideshow")) {
    return "linkedin_document";
  }
  if (token === "x" && postType === "thread") {
    return "x_thread";
  }

  return defaultPresetByPlatform[token];
}

export function resolvePostCompilerPresetIds(args: {
  config: Record<string, unknown>;
  platformSettings: Record<string, unknown>;
  postType: string;
}): PostCompilerPresetId[] {
  const { config, platformSettings, postType } = args;
  const candidates = [
    ...(typeof config.platformPreset === "string" ? [config.platformPreset] : []),
    ...stringListFromUnknown(config.platformPresets),
    ...stringListFromUnknown(config.optimizeForPlatforms),
    ...stringListFromUnknown(config.platforms),
    ...stringListFromUnknown(platformSettings.platform),
    ...stringListFromUnknown(platformSettings.platforms),
  ];

  const presetIds = unique(
    candidates.flatMap((candidate) => {
      const presetId = presetIdForToken(candidate, postType);
      return presetId ? [presetId] : [];
    })
  ) as PostCompilerPresetId[];

  if (presetIds.length) return presetIds;
  return [defaultPresetByPostType[postType] ?? DEFAULT_PRESET_ID];
}

export function buildPlatformPackages(args: {
  caption?: string;
  config: Record<string, unknown>;
  mediaSummary: Record<string, unknown>;
  platformSettings: Record<string, unknown>;
  postType: string;
}) {
  const presetIds = resolvePostCompilerPresetIds(args);
  const presets = presetIds
    .map((presetId) => presetForId(presetId))
    .filter((preset): preset is PostCompilerPreset => Boolean(preset));

  const platformPackages = presets.map((preset) => ({
    presetId: preset.id,
    label: preset.label,
    platform: preset.platform,
    surface: preset.surface,
    postType: args.postType,
    aspectRatios: preset.aspectRatios,
    mediaTypes: preset.mediaTypes,
    maxDurationSeconds: preset.maxDurationSeconds,
    captionMaxCharacters: preset.captionMaxCharacters,
    defaultHashtagCount: preset.defaultHashtagCount,
    caption: args.caption,
    mediaSummary: args.mediaSummary,
    notes: preset.notes,
  }));

  const primaryPreset = presets[0] ?? POST_COMPILER_PRESETS[0];

  return {
    primaryPlatformPreset: {
      presetId: primaryPreset.id,
      label: primaryPreset.label,
      platform: primaryPreset.platform,
      surface: primaryPreset.surface,
    },
    platformPackages,
    platformPresets: presets.map((preset) => ({
      presetId: preset.id,
      label: preset.label,
      platform: preset.platform,
      surface: preset.surface,
      postTypes: preset.postTypes,
      aspectRatios: preset.aspectRatios,
      mediaTypes: preset.mediaTypes,
      maxDurationSeconds: preset.maxDurationSeconds,
      captionMaxCharacters: preset.captionMaxCharacters,
      defaultHashtagCount: preset.defaultHashtagCount,
      notes: preset.notes,
    })),
    optimizeForPlatforms: unique(presets.map((preset) => preset.platform)),
    platformSettings: {
      ...args.platformSettings,
      primaryPlatform: primaryPreset.platform,
      primarySurface: primaryPreset.surface,
      primaryAspectRatio: primaryPreset.aspectRatios[0],
      captionMaxCharacters: primaryPreset.captionMaxCharacters,
      defaultHashtagCount: primaryPreset.defaultHashtagCount,
    },
  };
}
