import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ArtifactDocForRun } from "./executionTypes";
import type { ResolvedInputsForRun } from "./inputValues";

export function artifactIdsFromInputs(
  resolvedInputs: ResolvedInputsForRun,
  preferredKeys: string[]
): Id<"artifacts">[] {
  const ids = new Set<string>();
  const inputs = resolvedInputs.inputs ?? {};
  const orderedInputs = [
    ...preferredKeys.flatMap((key) => (inputs[key] ? [[key, inputs[key]] as const] : [])),
    ...Object.entries(inputs).filter(([key]) => !preferredKeys.includes(key)),
  ];

  for (const [, input] of orderedInputs) {
    for (const artifactId of input.artifactIds ?? []) {
      ids.add(artifactId);
    }
  }

  return [...ids] as Id<"artifacts">[];
}

export async function artifactsForIds(
  ctx: ActionCtx,
  artifactIds: Id<"artifacts">[]
): Promise<ArtifactDocForRun[]> {
  const artifacts: ArtifactDocForRun[] = [];
  const seen = new Set<string>();

  for (const artifactId of artifactIds) {
    if (seen.has(String(artifactId))) continue;
    seen.add(String(artifactId));
    const artifact = await ctx.runQuery(internal.artifacts.records.getForRunner, {
      artifactId,
    });
    if (artifact) artifacts.push(artifact);
  }

  return artifacts;
}
