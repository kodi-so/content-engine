import type { Platform } from "../../types";

/**
 * Platform configuration model for the post composer, limited to what the
 * PostBridge create-post API (`platform_configurations`) actually accepts.
 * PostBridge keys differ from app platform names only for X ("twitter").
 */
export type PostBridgePlatformKey =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "twitter"
  | "facebook"
  | "threads"
  | "pinterest";

export type PlatformConfigFieldType = "toggle" | "text" | "select";

export type PlatformConfigField = {
  key: string;
  type: PlatformConfigFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  /** Only offer this field when the posted media is a video. */
  videoOnly?: boolean;
  options?: Array<{ value: string; label: string }>;
};

export const PLATFORM_CONFIG_FIELDS: Record<
  PostBridgePlatformKey,
  PlatformConfigField[]
> = {
  tiktok: [
    {
      key: "draft",
      type: "toggle",
      label: "Send to TikTok as Draft",
      description:
        "Post is saved as a draft inside TikTok instead of publishing immediately. Check your TikTok inbox notifications to continue editing and publish.",
    },
    {
      key: "is_aigc",
      type: "toggle",
      label: "Mark as AI-Generated Content",
      description:
        'If enabled, the video will be labeled with a "Creator labeled as AI-generated" tag in the video\'s description.',
    },
    {
      key: "title",
      type: "text",
      label: "Title override",
      description: "Optional title used instead of the caption.",
      placeholder: "Optional TikTok title",
    },
  ],
  instagram: [
    {
      key: "placement_story",
      type: "toggle",
      label: "Post as Story",
      description:
        "Publishes as an Instagram Story instead of a Reel/feed post. Stories need exactly one image or video and do not support captions.",
    },
    {
      key: "is_trial_reel",
      type: "toggle",
      label: "Trial reel",
      videoOnly: true,
      description:
        "Shows the reel to non-followers first. Requires a Professional/Creator account with 1,000+ followers and a public profile.",
    },
  ],
  youtube: [
    {
      key: "title",
      type: "text",
      label: "Video title",
      description: "Optional title used instead of the caption.",
      placeholder: "Optional YouTube title",
    },
    {
      key: "contains_synthetic_media",
      type: "toggle",
      label: "Disclose altered or synthetic content",
      description:
        'Discloses realistic altered or AI-generated content. YouTube may show an "Altered or synthetic content" label to viewers.',
    },
  ],
  twitter: [
    {
      key: "first_comment",
      type: "text",
      label: "First comment",
      description:
        "Optional reply posted right after the tweet publishes. Links are allowed here, so this is the place for a URL or CTA.",
      placeholder: "Optional first comment",
    },
  ],
  facebook: [
    {
      key: "placement_story",
      type: "toggle",
      label: "Post as Story",
      description:
        "Publishes as a Facebook Page Story. Stories need exactly one image or video and do not support captions.",
    },
  ],
  threads: [
    {
      key: "location",
      type: "select",
      label: "Placement",
      description: "Where the post appears on Threads.",
      options: [
        { value: "", label: "Default" },
        { value: "timeline", label: "Timeline" },
        { value: "reels", label: "Reels" },
      ],
    },
  ],
  pinterest: [
    {
      key: "title",
      type: "text",
      label: "Pin title",
      placeholder: "Optional Pinterest title",
    },
    {
      key: "link",
      type: "text",
      label: "Destination link",
      description: "Link opened when the pin is clicked.",
      placeholder: "https://",
    },
    {
      key: "board_ids",
      type: "text",
      label: "Board IDs",
      description: "Comma-separated Pinterest board IDs to pin to.",
      placeholder: "board-id-1, board-id-2",
    },
  ],
};

export const PLATFORM_CONFIG_LABELS: Record<PostBridgePlatformKey, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "X / Twitter",
  facebook: "Facebook",
  threads: "Threads",
  pinterest: "Pinterest",
};

export type PlatformConfigState = Record<string, boolean | string>;
export type PlatformConfigsState = Partial<
  Record<PostBridgePlatformKey, PlatformConfigState>
>;

export function postBridgePlatformKey(
  platform: Platform
): PostBridgePlatformKey | null {
  if (platform === "x") return "twitter";
  if (platform in PLATFORM_CONFIG_FIELDS) return platform as PostBridgePlatformKey;
  return null;
}

function configValuesForPlatform(
  platformKey: PostBridgePlatformKey,
  state: PlatformConfigState
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const setIfFilled = (key: string, value: boolean | string | undefined) => {
    if (value === true) values[key] = true;
    if (typeof value === "string" && value.trim()) values[key] = value.trim();
  };

  switch (platformKey) {
    case "tiktok":
      setIfFilled("draft", state.draft);
      setIfFilled("is_aigc", state.is_aigc);
      setIfFilled("title", state.title);
      break;
    case "instagram":
      if (state.placement_story === true) values.placement = "story";
      setIfFilled("is_trial_reel", state.is_trial_reel);
      break;
    case "youtube":
      setIfFilled("title", state.title);
      setIfFilled("contains_synthetic_media", state.contains_synthetic_media);
      break;
    case "twitter":
      setIfFilled("first_comment", state.first_comment);
      break;
    case "facebook":
      if (state.placement_story === true) values.placement = "story";
      break;
    case "threads":
      setIfFilled("location", state.location);
      break;
    case "pinterest": {
      setIfFilled("title", state.title);
      setIfFilled("link", state.link);
      const boardIds = typeof state.board_ids === "string"
        ? state.board_ids.split(",").map((id) => id.trim()).filter(Boolean)
        : [];
      if (boardIds.length > 0) values.board_ids = boardIds;
      break;
    }
  }

  return values;
}

/**
 * Builds the PostBridge `platform_configurations` payload from the composer
 * state, keeping only platforms among the selected accounts and dropping
 * defaults/empty values. Returns undefined when nothing is configured.
 */
export function buildPlatformConfigurations(
  state: PlatformConfigsState,
  selectedPlatforms: Platform[]
): Record<string, unknown> | undefined {
  const configurations: Record<string, unknown> = {};

  for (const platform of new Set(selectedPlatforms)) {
    const platformKey = postBridgePlatformKey(platform);
    if (!platformKey) continue;
    const platformState = state[platformKey];
    if (!platformState) continue;

    const values = configValuesForPlatform(platformKey, platformState);
    if (Object.keys(values).length > 0) {
      configurations[platformKey] = values;
    }
  }

  return Object.keys(configurations).length > 0 ? configurations : undefined;
}
