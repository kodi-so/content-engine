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
    provider: "postiz",
    label: "Postiz",
    status: "ready",
    platforms: ["tiktok", "instagram", "youtube", "x", "linkedin"],
    notes:
      "Primary publishing route. TikTok-first workflows should use Postiz unless a future Post Bridge adapter is explicitly selected.",
  },
  {
    provider: "post_bridge",
    label: "Post Bridge",
    status: "reserved",
    platforms: ["tiktok", "instagram", "youtube", "x", "linkedin"],
    notes:
      "Reserved publishing route behind the abstraction. The provider is registered but not implemented yet.",
  },
  {
    provider: "manual",
    label: "Manual export",
    status: "manual",
    platforms: ["tiktok", "instagram", "youtube", "x", "linkedin"],
    notes:
      "Creates a local/manual publishing record. Use for export-only workflows and dry operational testing.",
  },
];

export const DEFAULT_PUBLISHING_PROVIDER: PublishingProvider = "postiz";
export const TIKTOK_FIRST_PUBLISHING_PROVIDER: PublishingProvider = "postiz";
export const X_PUBLISHING_PROVIDER: PublishingProvider = "postiz";

export function publishingRouteForProvider(provider: PublishingProvider) {
  return PUBLISHING_PROVIDER_ROUTES.find((route) => route.provider === provider) ??
    PUBLISHING_PROVIDER_ROUTES[0];
}
