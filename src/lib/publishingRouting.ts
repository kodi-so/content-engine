import type { Platform, PublishingProvider } from "../types";

export type PublishingProviderRoute = {
  provider: PublishingProvider;
  label: string;
  status: "ready" | "reserved" | "manual";
  platforms: Platform[];
  notes: string;
};

export const PUBLISHING_PROVIDER_ROUTES: PublishingProviderRoute[] = [
  {
    provider: "post_bridge",
    label: "PostBridge",
    status: "ready",
    platforms: [
      "tiktok",
      "instagram",
      "youtube",
      "x",
      "linkedin",
      "facebook",
      "threads",
      "pinterest",
      "bluesky",
      "google_business",
    ],
    notes:
      "Default live publishing route for synced PostBridge social accounts.",
  },
  {
    provider: "postiz",
    label: "Postiz",
    status: "ready",
    platforms: ["tiktok", "instagram", "youtube", "x", "linkedin"],
    notes:
      "Alternative publishing route kept behind the provider abstraction.",
  },
  {
    provider: "manual",
    label: "Manual export",
    status: "manual",
    platforms: ["tiktok", "instagram", "youtube", "x", "linkedin"],
    notes:
      "Creates a local/manual publishing record. Use for export-only automations and dry operational testing.",
  },
];

export const DEFAULT_PUBLISHING_PROVIDER: PublishingProvider = "post_bridge";
export const TIKTOK_FIRST_PUBLISHING_PROVIDER: PublishingProvider = "post_bridge";
export const X_PUBLISHING_PROVIDER: PublishingProvider = "post_bridge";

export function publishingRouteForProvider(provider: PublishingProvider) {
  return PUBLISHING_PROVIDER_ROUTES.find((route) => route.provider === provider) ??
    PUBLISHING_PROVIDER_ROUTES[0];
}
