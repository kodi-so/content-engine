import { SignOutButton, useUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import {
  Check,
  ChevronDown,
  LogOut,
  Plus,
} from "lucide-react";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { navItems } from "../app/navigation";
import { ContentEngineMark } from "./BrandLogo";
import { LoadingSignal } from "./ui";
import { useWorkspace } from "../contexts/WorkspaceContext";

type NavTooltipState = {
  label: string;
  top: number;
  left: number;
};

export function Sidebar() {
  const { user } = useUser();
  const location = useLocation();
  const {
    activeWorkspace,
    activeWorkspaceId,
    isWorkspaceLoading,
    setActiveWorkspaceId,
    workspaces,
  } = useWorkspace();
  const [navTooltip, setNavTooltip] = useState<NavTooltipState | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const createWorkspace = useMutation(api.workspaces.workspaces.createWorkspace);
  const isFullScreenWorkspaceRoute = location.pathname === "/studio";
  const navTooltipStyle = navTooltip
    ? ({
        top: `${navTooltip.top}px`,
        left: `${navTooltip.left}px`,
      } satisfies CSSProperties)
    : undefined;
  const sortedWorkspaces = useMemo(
    () =>
      [...(workspaces ?? [])].sort(
        (first, second) => second.workspace.updatedAt - first.workspace.updatedAt
      ),
    [workspaces]
  );

  const showNavTooltip = (target: HTMLElement, label: string) => {
    if (!target.closest(".app-shell-canvas")) return;

    const rect = target.getBoundingClientRect();
    setNavTooltip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  const handleCreateWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name) return;

    setWorkspaceStatus("Creating workspace...");
    try {
      const workspaceId = await createWorkspace({ name });
      setActiveWorkspaceId(workspaceId);
      setNewWorkspaceName("");
      setIsCreatingWorkspace(false);
      setIsWorkspaceMenuOpen(false);
      setWorkspaceStatus("Workspace created.");
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : "Workspace creation failed.");
    }
  };

  return (
    <>
      <aside className="sidebar">
        <div className="app-mark">
          <ContentEngineMark className="app-symbol" />
          <span>
            Content Engine
            <small>Agent workspace</small>
          </span>
        </div>

        <div
          className={[
            "relative mb-[var(--space-4)] grid gap-[var(--space-2)] border-b border-[var(--color-sidebar-border)] pb-[var(--space-4)]",
            "max-[900px]:mb-[var(--space-3)]",
            isFullScreenWorkspaceRoute ? "hidden" : "",
          ].filter(Boolean).join(" ")}
        >
          <span className="text-[0.68rem] font-[750] uppercase leading-[1.1] tracking-[0.06em] text-[var(--color-sidebar-muted)]">
            Workspace
          </span>
          <button
            aria-expanded={isWorkspaceMenuOpen}
            className="grid min-h-[3rem] w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_1rem] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[oklch(100%_0_0_/_0.1)] bg-[oklch(100%_0_0_/_0.06)] px-[var(--space-2)] text-left text-[var(--color-sidebar-text)] outline-none hover:bg-[oklch(100%_0_0_/_0.085)] focus:border-[oklch(76%_0.11_150)]"
            disabled={isWorkspaceLoading}
            type="button"
            onClick={() => setIsWorkspaceMenuOpen((isOpen) => !isOpen)}
          >
            <span className="grid size-8 place-items-center rounded-full bg-[oklch(92%_0.07_145)] text-[0.76rem] font-[820] uppercase text-[oklch(18%_0.04_210)]">
              {isWorkspaceLoading ? (
                <LoadingSignal className="text-[oklch(18%_0.04_210)]" label="Loading workspace" size="sm" />
              ) : (
                activeWorkspace?.name?.[0] ?? "W"
              )}
            </span>
            <span className="min-w-0 break-words text-[0.86rem] font-[760] leading-[1.18] line-clamp-2">
              {activeWorkspace?.name ?? "Loading workspace"}
            </span>
            <ChevronDown
              className={[
                "text-[var(--color-sidebar-muted)] transition",
                isWorkspaceMenuOpen ? "rotate-180" : "",
              ].join(" ")}
              size={15}
            />
          </button>

          {isWorkspaceMenuOpen ? (
            <div className="grid gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[oklch(100%_0_0_/_0.12)] bg-[oklch(7%_0.022_220)] p-[var(--space-2)] shadow-[0_14px_28px_oklch(0%_0_0_/_0.3)]">
              <div className="grid gap-[0.25rem]">
                <span className="px-[var(--space-2)] py-[0.25rem] text-[0.68rem] font-[760] uppercase tracking-[0.06em] text-[var(--color-sidebar-muted)]">
                  Workspaces
                </span>
                {sortedWorkspaces.length === 0 ? (
                  <span className="px-[var(--space-2)] py-[var(--space-3)] text-[0.78rem] text-[var(--color-sidebar-muted)]">
                    <LoadingSignal label="Loading workspaces" showLabel size="sm" />
                  </span>
                ) : (
                  sortedWorkspaces.map(({ workspace }) => {
                    const isActive = workspace._id === activeWorkspaceId;
                    return (
                      <button
                        className={[
                          "grid min-h-[2.7rem] grid-cols-[1.6rem_minmax(0,1fr)_1rem] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-2)] text-left transition",
                          isActive
                            ? "bg-[oklch(100%_0_0_/_0.1)] text-[var(--color-sidebar-text)]"
                            : "text-[var(--color-sidebar-muted)] hover:bg-[oklch(100%_0_0_/_0.055)] hover:text-[var(--color-sidebar-text)]",
                        ].join(" ")}
                        key={workspace._id}
                        type="button"
                        onClick={() => {
                          setActiveWorkspaceId(workspace._id);
                          setIsWorkspaceMenuOpen(false);
                        }}
                      >
                        <span className="grid size-7 place-items-center rounded-full bg-[oklch(100%_0_0_/_0.08)] text-[0.7rem] font-[820] uppercase text-[var(--color-sidebar-text)]">
                          {workspace.name[0]}
                        </span>
                        <span className="min-w-0 break-words text-[0.82rem] font-[700] leading-[1.18] line-clamp-2">
                          {workspace.name}
                        </span>
                        {isActive ? <Check size={14} /> : null}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="border-t border-[oklch(100%_0_0_/_0.1)] pt-[var(--space-2)]">
                {!isCreatingWorkspace ? (
                  <button
                    className="grid min-h-[2.65rem] w-full grid-cols-[1.6rem_minmax(0,1fr)] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-2)] text-left text-[var(--color-sidebar-muted)] transition hover:bg-[oklch(100%_0_0_/_0.055)] hover:text-[var(--color-sidebar-text)]"
                    type="button"
                    onClick={() => {
                      setIsCreatingWorkspace(true);
                      setWorkspaceStatus("");
                    }}
                  >
                    <span className="grid size-7 place-items-center rounded-full border border-[oklch(100%_0_0_/_0.14)]">
                      <Plus size={14} />
                    </span>
                    <span className="text-[0.82rem] font-[700]">Create workspace</span>
                  </button>
                ) : (
                  <form className="grid gap-[var(--space-2)]" onSubmit={handleCreateWorkspace}>
                    <label className="grid gap-[var(--space-1)]">
                      <span className="px-[var(--space-1)] text-[0.68rem] font-[760] uppercase tracking-[0.06em] text-[var(--color-sidebar-muted)]">
                        Create workspace
                      </span>
                      <input
                        className="min-h-[2.45rem] rounded-[var(--radius-sm)] border border-[oklch(100%_0_0_/_0.12)] bg-[oklch(4%_0.018_220)] px-[var(--space-2)] text-[0.82rem] font-[620] text-[var(--color-sidebar-text)] outline-none placeholder:text-[var(--color-sidebar-muted)] focus:border-[oklch(76%_0.11_150)]"
                        placeholder="Team name"
                        value={newWorkspaceName}
                        onChange={(event) => setNewWorkspaceName(event.target.value)}
                      />
                    </label>
                    <div className="grid grid-cols-[1fr_1fr] gap-[var(--space-2)]">
                      <button
                        className="inline-flex min-h-[2.25rem] items-center justify-center rounded-[var(--radius-sm)] px-[var(--space-2)] text-[0.78rem] font-[760] text-[var(--color-sidebar-muted)] hover:bg-[oklch(100%_0_0_/_0.055)]"
                        type="button"
                        onClick={() => {
                          setIsCreatingWorkspace(false);
                          setNewWorkspaceName("");
                          setWorkspaceStatus("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="inline-flex min-h-[2.25rem] items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-sm)] bg-[oklch(58%_0.13_166)] px-[var(--space-2)] text-[0.78rem] font-[760] text-[oklch(99%_0.005_170)] disabled:cursor-not-allowed disabled:opacity-55"
                        disabled={!newWorkspaceName.trim()}
                        type="submit"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                )}
                {workspaceStatus ? (
                  <p className="m-0 px-[var(--space-1)] pt-[var(--space-2)] text-[0.72rem] leading-[1.35] text-[var(--color-sidebar-muted)]">
                    {workspaceStatus}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <NavLink
              aria-label={item.label}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              key={item.to}
              onBlur={() => setNavTooltip(null)}
              onFocus={(event) => showNavTooltip(event.currentTarget, item.label)}
              onMouseEnter={(event) => showNavTooltip(event.currentTarget, item.label)}
              onMouseLeave={() => setNavTooltip(null)}
              title={item.label}
              to={item.to}
            >
              <item.icon size={18} />
              <span className="nav-link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="user-panel">
          <div className="user-meta">
            <div className="avatar">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt={user.fullName || "User"} />
              ) : (
                <span>{user?.fullName?.[0] || "U"}</span>
              )}
            </div>
            <div>
              <div className="user-name">{user?.fullName || "User"}</div>
              <div className="user-email">{user?.primaryEmailAddress?.emailAddress}</div>
            </div>
          </div>
          <SignOutButton signOutOptions={{ redirectUrl: "/" }}>
            <button className="quiet-button" type="button">
              <LogOut size={16} />
              Sign out
            </button>
          </SignOutButton>
        </div>
      </aside>

      {navTooltip ? (
        <div
          className="pointer-events-none fixed z-[60] grid w-max max-w-[min(14rem,calc(100vw-7rem))] translate-y-[-50%] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--color-ink)] shadow-[var(--shadow-lg)] before:absolute before:left-[-0.34rem] before:top-1/2 before:size-[0.62rem] before:translate-y-[-50%] before:rotate-45 before:border-b before:border-l before:border-[var(--color-border)] before:bg-[var(--color-surface)] before:content-['']"
          role="tooltip"
          style={navTooltipStyle}
        >
          <strong className="text-[0.8rem] font-[780] leading-[1.2]">{navTooltip.label}</strong>
        </div>
      ) : null}
    </>
  );
}
