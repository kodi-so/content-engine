import type { DiscoveredSocialContent } from "../../providers/scrapeCreators/client";

function compactCaption(value: string | undefined) {
  if (!value) return "No caption";
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 220 ? `${compact.slice(0, 220)}…` : compact;
}

function metricSummary(item: DiscoveredSocialContent) {
  if (!item.metrics) return "";
  const parts = [
    item.metrics.views !== undefined ? `${item.metrics.views} views` : undefined,
    item.metrics.likes !== undefined ? `${item.metrics.likes} likes` : undefined,
    item.metrics.comments !== undefined ? `${item.metrics.comments} comments` : undefined,
    item.metrics.shares !== undefined ? `${item.metrics.shares} shares` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? ` | ${parts.join(", ")}` : "";
}

export function socialContentContextLines(
  content: DiscoveredSocialContent[],
  options: { includePlatform?: boolean } = {}
) {
  return content.map((item, index) => [
    `${index + 1}. ${options.includePlatform ? `${item.platform} ` : ""}${item.mediaType}`,
    item.creatorHandle ? ` by @${item.creatorHandle}` : "",
    item.pinned ? " (pinned)" : "",
    item.publishedAt ? ` | ${item.publishedAt}` : "",
    metricSummary(item),
    `\nURL: ${item.url}`,
    `\nCaption: ${compactCaption(item.caption)}`,
  ].join(""));
}
