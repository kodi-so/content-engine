import {
  finiteNumber,
  normalizeMediaTextOverlayBlock,
  normalizeTimedMediaTextOverlayBlock,
  type MediaTextOverlayAlign,
  type MediaTextOverlayBlock,
  type MediaTextOverlayEmphasis,
  type MediaTextOverlayRole,
  type TimedMediaTextOverlayBlock,
} from "./mediaTextOverlays";

export type OverlayZone = "top" | "center" | "bottom";

export type OverlayDesignBlockIntent = {
  id?: string;
  role: MediaTextOverlayRole;
  text: string;
  emphasis?: MediaTextOverlayEmphasis;
  zone?: OverlayZone;
  align?: MediaTextOverlayAlign;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  startSeconds?: number;
  endSeconds?: number;
  clipIndex?: number;
};

export type OverlayDesignRequest = {
  medium: "slideshow_slide" | "video";
  aspectRatio: string;
  blocks: OverlayDesignBlockIntent[];
  contrastStrategy?: "none" | "shadow" | "gradient_scrim" | "solid_scrim";
  applyPlatformSafeArea?: boolean;
  totalDurationSeconds?: number;
  clipBoundariesSeconds?: number[];
};

type SafeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const roleOrder: MediaTextOverlayRole[] = ["eyebrow", "headline", "body", "bullet_list", "cta"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safeRect(aspectRatio: string, enabled: boolean): SafeRect {
  if (!enabled) return { left: 4, top: 4, right: 4, bottom: 4 };
  if (aspectRatio === "9:16") return { left: 4, top: 10, right: 14, bottom: 22 };
  if (aspectRatio === "4:5") return { left: 4, top: 8, right: 8, bottom: 12 };
  return { left: 6, top: 6, right: 6, bottom: 6 };
}

function defaultZone(role: MediaTextOverlayRole): OverlayZone {
  if (role === "eyebrow") return "top";
  if (role === "headline") return "center";
  return "bottom";
}

function baseFontSize(role: MediaTextOverlayRole) {
  if (role === "headline") return 72;
  if (role === "cta") return 60;
  if (role === "body") return 44;
  if (role === "bullet_list") return 40;
  return 32;
}

function fontWeight(role: MediaTextOverlayRole, emphasis: MediaTextOverlayEmphasis) {
  if (emphasis === "muted") return 650;
  if (role === "body" || role === "bullet_list") return 720;
  return 850;
}

function estimatedHeight(text: string, fontSize: number, width: number) {
  const charsPerLine = Math.max(8, Math.floor(width * (72 / fontSize) * 0.46));
  const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
  return clamp(lineCount * (fontSize / 960) * 100 * 1.12, 5, 32);
}

function fontSizeForIntent(block: OverlayDesignBlockIntent) {
  const base = baseFontSize(block.role);
  const shrink = clamp(Math.sqrt(40 / Math.max(block.text.length, 20)), 0.6, 1);
  return Math.round(base * shrink);
}

function explicitGeometry(block: OverlayDesignBlockIntent) {
  return finiteNumber(block.x) !== undefined ||
    finiteNumber(block.y) !== undefined ||
    finiteNumber(block.fontSize) !== undefined;
}

function styleForContrast(
  contrastStrategy: OverlayDesignRequest["contrastStrategy"],
  emphasis: MediaTextOverlayEmphasis
) {
  const primary = emphasis === "primary";
  if (contrastStrategy === "solid_scrim") {
    return {
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 0,
      backgroundStyle: "solid" as const,
      backgroundColor: "#000000",
      backgroundOpacity: 0.55,
    };
  }
  return {
    color: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: primary ? 8 : 5,
    backgroundStyle: "none" as const,
    backgroundColor: "#000000",
    backgroundOpacity: 0,
  };
}

function blockBase(
  block: OverlayDesignBlockIntent,
  index: number,
  request: OverlayDesignRequest
): OverlayDesignBlockIntent & Record<string, unknown> {
  const emphasis = block.emphasis ?? (index === 0 ? "primary" : "secondary");
  const style = styleForContrast(request.contrastStrategy ?? "shadow", emphasis);
  return {
    ...block,
    id: block.id ?? `overlay-${index + 1}`,
    items: [],
    emphasis,
    align: block.align ?? "center",
    fontWeight: fontWeight(block.role, emphasis),
    ...style,
  };
}

function concreteBlock(
  block: OverlayDesignBlockIntent,
  index: number,
  request: OverlayDesignRequest,
  frame?: { x: number; y: number; width: number; height: number; fontSize: number }
) {
  return normalizeMediaTextOverlayBlock(
    {
      ...blockBase(block, index, request),
      ...frame,
    },
    index,
    { defaultIdPrefix: "overlay" }
  );
}

export function designOverlayBlocks(request: OverlayDesignRequest): MediaTextOverlayBlock[] {
  const applySafeArea = request.applyPlatformSafeArea ??
    (request.aspectRatio === "9:16" || request.aspectRatio === "4:5");
  const safe = safeRect(request.aspectRatio, applySafeArea);
  const safeX = safe.left;
  const safeY = safe.top;
  const safeWidth = 100 - safe.left - safe.right;
  const safeHeight = 100 - safe.top - safe.bottom;
  const designed: Array<MediaTextOverlayBlock | null> = new Array(request.blocks.length).fill(null);

  request.blocks.forEach((block, index) => {
    if (!explicitGeometry(block)) return;
    designed[index] = concreteBlock(block, index, request);
  });

  const groups = new Map<OverlayZone, Array<{ block: OverlayDesignBlockIntent; index: number; height: number; fontSize: number }>>();
  request.blocks.forEach((block, index) => {
    if (designed[index]) return;
    const zone = block.zone ?? defaultZone(block.role);
    const fontSize = fontSizeForIntent(block);
    const width = finiteNumber(block.width) ?? safeWidth;
    const height = finiteNumber(block.height) ?? estimatedHeight(block.text, fontSize, width);
    const group = groups.get(zone) ?? [];
    group.push({ block, index, height, fontSize });
    groups.set(zone, group);
  });

  for (const [zone, blocks] of groups.entries()) {
    blocks.sort((a, b) => {
      const roleDelta = roleOrder.indexOf(a.block.role) - roleOrder.indexOf(b.block.role);
      return roleDelta || a.index - b.index;
    });
    const totalHeight = blocks.reduce((sum, item) => sum + item.height, 0) +
      Math.max(0, blocks.length - 1) * 3;
    let y = zone === "top"
      ? safeY
      : zone === "bottom"
        ? safeY + safeHeight - totalHeight
        : safeY + (safeHeight - totalHeight) / 2;
    y = clamp(y, safeY, safeY + safeHeight);

    blocks.forEach((item) => {
      const width = finiteNumber(item.block.width) ?? safeWidth;
      const x = finiteNumber(item.block.x) ?? safeX + (safeWidth - width) / 2;
      const height = clamp(item.height, 4, safeY + safeHeight - y);
      designed[item.index] = concreteBlock(item.block, item.index, request, {
        x: clamp(x, safeX, safeX + safeWidth - width),
        y: clamp(y, safeY, safeY + safeHeight - height),
        width,
        height,
        fontSize: finiteNumber(item.block.fontSize) ?? item.fontSize,
      });
      y += height + 3;
    });
  }

  return designed
    .filter((block): block is MediaTextOverlayBlock => Boolean(block))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function clipWindow(args: {
  clipBoundariesSeconds?: number[];
  clipIndex: number;
  totalDurationSeconds: number;
}) {
  const end = args.clipBoundariesSeconds?.[args.clipIndex];
  const start = args.clipIndex === 0 ? 0 : args.clipBoundariesSeconds?.[args.clipIndex - 1];
  return {
    start: finiteNumber(start) ?? 0,
    end: finiteNumber(end) ?? args.totalDurationSeconds,
  };
}

function timingForBlock(args: {
  block: OverlayDesignBlockIntent;
  index: number;
  blockCount: number;
  totalDurationSeconds: number;
  clipBoundariesSeconds?: number[];
}) {
  const explicitStart = finiteNumber(args.block.startSeconds);
  const explicitEnd = finiteNumber(args.block.endSeconds);
  if (explicitStart !== undefined || explicitEnd !== undefined) {
    const start = clamp(explicitStart ?? 0, 0, args.totalDurationSeconds);
    return {
      startSeconds: start,
      endSeconds: clamp(explicitEnd ?? args.totalDurationSeconds, start + 0.1, args.totalDurationSeconds),
    };
  }

  if (finiteNumber(args.block.clipIndex) !== undefined) {
    const window = clipWindow({
      clipBoundariesSeconds: args.clipBoundariesSeconds,
      clipIndex: Math.max(0, Math.floor(args.block.clipIndex ?? 0)),
      totalDurationSeconds: args.totalDurationSeconds,
    });
    return { startSeconds: window.start, endSeconds: Math.max(window.start + 0.1, window.end) };
  }

  if (args.blockCount <= 1) return { startSeconds: 0, endSeconds: args.totalDurationSeconds };

  const windows = args.clipBoundariesSeconds?.length
    ? args.clipBoundariesSeconds.map((_, clipIndex) =>
        clipWindow({ clipBoundariesSeconds: args.clipBoundariesSeconds, clipIndex, totalDurationSeconds: args.totalDurationSeconds })
      )
    : [];
  const window = windows[args.index];
  if (window) return { startSeconds: window.start, endSeconds: Math.max(window.start + 0.1, window.end) };

  const segment = args.totalDurationSeconds / args.blockCount;
  const start = segment * args.index;
  return {
    startSeconds: start,
    endSeconds: args.index === args.blockCount - 1
      ? args.totalDurationSeconds
      : Math.max(start + 1.5, segment * (args.index + 1)),
  };
}

export function designTimedOverlayBlocks(request: OverlayDesignRequest): TimedMediaTextOverlayBlock[] {
  const totalDurationSeconds = Math.max(0.5, request.totalDurationSeconds ?? 4);
  const blocks = designOverlayBlocks(request);
  const sourceById = new Map(
    request.blocks.map((block, index) => [block.id ?? `overlay-${index + 1}`, { block, index }])
  );
  return blocks.flatMap((block, index) => {
    const source = sourceById.get(block.id);
    if (!source) return [];
    const timing = timingForBlock({
      block: source.block,
      index: source.index,
      blockCount: request.blocks.length,
      totalDurationSeconds,
      clipBoundariesSeconds: request.clipBoundariesSeconds,
    });
    const timed = normalizeTimedMediaTextOverlayBlock(
      {
        ...block,
        ...timing,
      },
      index,
      totalDurationSeconds,
      { defaultIdPrefix: "overlay" }
    );
    return timed ? [timed] : [];
  });
}
