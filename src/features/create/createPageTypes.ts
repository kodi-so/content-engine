import type { Id } from "../../../convex/_generated/dataModel";
import type { CreateMode } from "../../lib/create/createModes";

export type CreateResult = {
  kind: CreateMode;
  status: "pending" | "review" | "saved" | "error";
  requestId?: Id<"contentRequests">;
  artifactIds?: Id<"artifacts">[];
  title: string;
  detail: string;
  model?: string;
  prompt?: string;
  url?: string;
};
