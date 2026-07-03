import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function libraryReferencesFromConfig(config: Record<string, unknown>) {
  return Object.entries(config).flatMap(([configKey, value]) => {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      if (!isRecord(item)) return [];
      const source = item.source;
      const sourceId = item.sourceId;
      if (
        source !== "create" &&
        source !== "workflow_export" &&
        source !== "creative_asset"
      ) {
        return [];
      }
      if (typeof sourceId !== "string" || !sourceId.trim()) return [];

      return [{
        configKey,
        source,
        sourceId: sourceId.trim(),
        title: typeof item.title === "string" ? item.title : "Library asset",
      }];
    });
  });
}

export async function assertLibraryReferencesExistForRun(
  ctx: ActionCtx,
  args: {
    config: Record<string, unknown>;
    nodeLabel: string;
    userId: string;
  }
) {
  const references = libraryReferencesFromConfig(args.config);
  for (const reference of references) {
    if (reference.source === "creative_asset") {
      const asset = await ctx.runQuery(internal.accounts.creativeAssets.getForRunner, {
        id: reference.sourceId as Id<"creativeAssets">,
      });
      if (!asset || asset.userId !== args.userId) {
        throw new Error(
          `${args.nodeLabel} references a Library asset that was deleted: ${reference.title}.`
        );
      }
      continue;
    }

    const artifact = await ctx.runQuery(internal.artifacts.records.getForRunner, {
      artifactId: reference.sourceId as Id<"artifacts">,
    });
    if (!artifact || artifact.userId !== args.userId) {
      throw new Error(
        `${args.nodeLabel} references a Library asset that was deleted: ${reference.title}.`
      );
    }
  }
}
