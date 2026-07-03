export function agentCreateClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatAgentCreateEntityType(entityType: string) {
  return entityType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function mentionTokenForLabel(label: string) {
  const cleanLabel = label
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);

  return `@${cleanLabel || "reference"}`;
}

export function formatAgentCreateTimestamp(timestamp?: number) {
  if (!timestamp) return undefined;

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
