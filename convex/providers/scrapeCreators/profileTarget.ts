import {
  ScrapeCreatorsError,
  type SocialDiscoveryPlatform,
  type SocialDiscoveryTarget,
} from "./types";

function normalizedHandle(value: string) {
  const handle = decodeURIComponent(value).trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,32}$/.test(handle)) {
    throw new ScrapeCreatorsError("Social profile handle is invalid.");
  }
  return handle;
}

function platformFromHost(hostname: string): SocialDiscoveryPlatform | undefined {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  return undefined;
}

function profileTargetFromUrl(value: string): SocialDiscoveryTarget {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ScrapeCreatorsError("Social profile must be an Instagram or TikTok profile URL.");
  }

  const platform = platformFromHost(url.hostname);
  if (!platform) {
    throw new ScrapeCreatorsError("Only public Instagram and TikTok profiles are supported.");
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  if (platform === "instagram") {
    const reservedPaths = new Set(["p", "reel", "reels", "tv", "explore", "stories"]);
    if (!pathParts[0] || pathParts.length > 1 || reservedPaths.has(pathParts[0].toLowerCase())) {
      throw new ScrapeCreatorsError(
        "Instagram discovery needs a profile URL, not an individual post or Instagram section URL."
      );
    }
    const handle = normalizedHandle(pathParts[0]);
    return {
      platform,
      handle,
      profileUrl: `https://www.instagram.com/${handle}/`,
    };
  }

  if (!pathParts[0]?.startsWith("@") || pathParts.length > 1) {
    throw new ScrapeCreatorsError(
      "TikTok discovery needs a profile URL such as https://www.tiktok.com/@creator."
    );
  }
  const handle = normalizedHandle(pathParts[0]);
  return {
    platform,
    handle,
    profileUrl: `https://www.tiktok.com/@${handle}`,
  };
}

export function resolveSocialDiscoveryTarget(input: {
  profile: string;
  platform?: SocialDiscoveryPlatform;
}): SocialDiscoveryTarget {
  const profile = input.profile.trim();
  if (!profile) throw new ScrapeCreatorsError("A social profile URL or handle is required.");

  const resemblesUrl = /^https?:\/\//i.test(profile) ||
    /(^|\.)instagram\.com\//i.test(profile) ||
    /(^|\.)tiktok\.com\//i.test(profile);
  if (resemblesUrl) {
    const target = profileTargetFromUrl(profile);
    if (input.platform && input.platform !== target.platform) {
      throw new ScrapeCreatorsError(
        `The supplied profile URL is for ${target.platform}, not ${input.platform}.`
      );
    }
    return target;
  }

  if (!input.platform) {
    throw new ScrapeCreatorsError(
      "Platform is required when social discovery receives a bare handle."
    );
  }
  const handle = normalizedHandle(profile);
  return {
    platform: input.platform,
    handle,
    profileUrl: input.platform === "instagram"
      ? `https://www.instagram.com/${handle}/`
      : `https://www.tiktok.com/@${handle}`,
  };
}
