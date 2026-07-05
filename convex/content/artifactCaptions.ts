export function artifactCaptionFromPrompt(prompt: string, prefix?: string) {
  const base = prompt.replace(/\s+/g, " ").trim();
  if (!base) return undefined;
  const caption = prefix ? `${prefix}: ${base}` : base;
  if (caption.length <= 140) return caption;

  const truncated = caption.slice(0, 139);
  const boundary = truncated.search(/\s+\S*$/);
  const wordBoundary = boundary > 80 ? truncated.slice(0, boundary).trimEnd() : truncated.trimEnd();
  return `${wordBoundary}…`;
}

export function dataWithArtifactCaption(data: unknown, prompt?: string, prefix?: string) {
  const caption = prompt ? artifactCaptionFromPrompt(prompt, prefix) : undefined;
  if (!caption) return data;
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    ...record,
    caption,
  };
}
