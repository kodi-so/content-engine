import { useMutation, useQuery } from "convex/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

const WORKSPACE_STORAGE_KEY = "content-engine-active-workspace";

type WorkspaceListItem = {
  membership: Doc<"workspaceMembers">;
  workspace: Doc<"workspaces">;
};

type WorkspaceContextValue = {
  activeMembership?: Doc<"workspaceMembers">;
  activeWorkspace?: Doc<"workspaces">;
  activeWorkspaceId?: Id<"workspaces">;
  isWorkspaceAdmin: boolean;
  isWorkspaceLoading: boolean;
  setActiveWorkspaceId: (workspaceId: Id<"workspaces">) => void;
  workspaces?: WorkspaceListItem[];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const ensureCurrentUser = useMutation(api.auth.users.ensure);
  const workspaces = useQuery(api.workspaces.workspaces.list);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<Id<"workspaces"> | undefined>(
    () => {
      if (typeof window === "undefined") return undefined;
      return window.localStorage.getItem(WORKSPACE_STORAGE_KEY) as Id<"workspaces"> | null
        ?? undefined;
    }
  );

  useEffect(() => {
    void ensureCurrentUser();
  }, [ensureCurrentUser]);

  const activeItem = useMemo(() => {
    if (!workspaces?.length) return undefined;
    return (
      workspaces.find((item) => item.workspace._id === selectedWorkspaceId) ??
      workspaces.find((item) => item.workspace.workspaceType === "personal") ??
      workspaces[0]
    );
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (!activeItem) return;
    if (activeItem.workspace._id === selectedWorkspaceId) return;
    setSelectedWorkspaceId(activeItem.workspace._id);
  }, [activeItem, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId || typeof window === "undefined") return;
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      activeMembership: activeItem?.membership,
      activeWorkspace: activeItem?.workspace,
      activeWorkspaceId: activeItem?.workspace._id,
      isWorkspaceAdmin:
        activeItem?.membership.role === "owner" || activeItem?.membership.role === "admin",
      isWorkspaceLoading: workspaces === undefined,
      setActiveWorkspaceId: setSelectedWorkspaceId,
      workspaces,
    }),
    [activeItem, workspaces]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
