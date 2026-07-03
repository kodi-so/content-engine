import { useState, type Dispatch, type SetStateAction } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
  AgentCreateCheckpoint,
  AgentCreateCheckpointMode,
} from "../model/agentCreateTypes";

type CheckpointId = Id<"createCheckpoints">;
type ThreadId = Id<"createThreads">;

export function useAgentCreateCheckpointActions({
  activeThreadId,
  approveCheckpoint,
  checkpointMode,
  continueThread,
  setCheckpointRevisionNotes,
  setStatusMessage,
  submitAgentMessage,
  updateCheckpoint,
}: {
  activeThreadId: ThreadId | null;
  approveCheckpoint: (args: {
    checkpointId: CheckpointId;
    response?: string;
  }) => Promise<unknown>;
  checkpointMode: AgentCreateCheckpointMode;
  continueThread: (args: { threadId: ThreadId }) => Promise<unknown>;
  setCheckpointRevisionNotes: Dispatch<SetStateAction<Record<string, string>>>;
  setStatusMessage: (message: string) => void;
  submitAgentMessage: (args: {
    checkpointMode: AgentCreateCheckpointMode;
    content: string;
    threadId: ThreadId;
  }) => Promise<unknown>;
  updateCheckpoint: (args: {
    id: CheckpointId;
    response?: string;
    status: "approved" | "rejected" | "revised";
  }) => Promise<unknown>;
}) {
  const [pendingCheckpointId, setPendingCheckpointId] = useState<CheckpointId | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);

  const setCheckpointStatus = async (
    checkpoint: AgentCreateCheckpoint,
    status: "approved" | "rejected" | "revised",
    response?: string
  ) => {
    setPendingCheckpointId(checkpoint.id as CheckpointId);
    setStatusMessage("");
    try {
      if (status === "approved") {
        await approveCheckpoint({
          checkpointId: checkpoint.id as CheckpointId,
          response,
        });
      } else {
        await updateCheckpoint({
          id: checkpoint.id as CheckpointId,
          status,
          response,
        });
        if (status === "revised" && response?.trim() && activeThreadId) {
          await submitAgentMessage({
            threadId: activeThreadId,
            checkpointMode,
            content: `Revise from checkpoint "${checkpoint.label}": ${response.trim()}`,
          });
        }
      }
      setCheckpointRevisionNotes((current) => {
        const next = { ...current };
        delete next[checkpoint.id];
        return next;
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to update checkpoint");
    } finally {
      setPendingCheckpointId(null);
    }
  };

  const continueQueuedTools = async () => {
    if (!activeThreadId || isContinuing) return;

    setIsContinuing(true);
    setStatusMessage("");
    try {
      await continueThread({ threadId: activeThreadId });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to continue");
    } finally {
      setIsContinuing(false);
    }
  };

  return {
    continueQueuedTools,
    isContinuing,
    pendingCheckpointId,
    setCheckpointStatus,
  };
}
