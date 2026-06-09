import { SignOutButton, useUser } from "@clerk/clerk-react";
import { BrainCircuit, BriefcaseBusiness, LogOut, Settings } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { navItems } from "../app/navigation";
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
    activeMembership,
    activeWorkspace,
    activeWorkspaceId,
    isWorkspaceLoading,
    setActiveWorkspaceId,
    workspaces,
  } = useWorkspace();
  const [navTooltip, setNavTooltip] = useState<NavTooltipState | null>(null);
  const isWorkflowCanvasRoute = /^\/workflows\/[^/]+/.test(location.pathname);
  const navTooltipStyle = navTooltip
    ? ({
        top: `${navTooltip.top}px`,
        left: `${navTooltip.left}px`,
      } satisfies CSSProperties)
    : undefined;

  const showNavTooltip = (target: HTMLElement, label: string) => {
    if (!target.closest(".app-shell-canvas")) return;

    const rect = target.getBoundingClientRect();
    setNavTooltip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  return (
    <>
      <aside className="sidebar">
        <div className="brand-mark">
          <span className="brand-symbol">
            <BrainCircuit size={18} />
          </span>
          <span>
            Content Engine
            <small>Agent workspace</small>
          </span>
        </div>

        <div
          className={[
            "mb-[var(--space-4)] grid gap-[var(--space-2)] rounded-[var(--radius-md)]",
            "border border-[var(--color-sidebar-border)] bg-[oklch(100%_0_0_/_0.045)] p-[var(--space-3)]",
            "max-[900px]:mb-[var(--space-3)]",
            isWorkflowCanvasRoute ? "hidden" : "",
          ].filter(Boolean).join(" ")}
        >
          <label className="grid gap-[var(--space-2)]">
            <span className="text-[0.68rem] font-[750] uppercase leading-[1.1] tracking-[0.06em] text-[var(--color-sidebar-muted)]">
              Workspace
            </span>
            <select
              aria-label="Active workspace"
              className="min-h-[2.35rem] w-full min-w-0 rounded-[var(--radius-sm)] border border-[oklch(100%_0_0_/_0.1)] bg-[oklch(12%_0.028_220)] px-[var(--space-2)] text-[0.82rem] font-[650] text-[var(--color-sidebar-text)]"
              disabled={isWorkspaceLoading || !workspaces?.length}
              value={activeWorkspaceId ?? ""}
              onChange={(event) => setActiveWorkspaceId(event.target.value as typeof activeWorkspaceId)}
            >
              {!activeWorkspaceId ? <option value="">Loading</option> : null}
              {workspaces?.map(({ workspace }) => (
                <option key={workspace._id} value={workspace._id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between gap-[var(--space-2)] text-[0.72rem] capitalize text-[var(--color-sidebar-muted)]">
            <span className="inline-flex min-w-0 items-center gap-[var(--space-1)]">
              <BriefcaseBusiness size={13} />
              {activeWorkspace?.workspaceType === "team" ? "Team" : "Personal"}
            </span>
            {activeMembership ? <span>{activeMembership.role}</span> : null}
          </div>
          <Link
            className="inline-flex min-h-[2rem] items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-sm)] text-[0.78rem] font-[650] text-[var(--color-sidebar-text)] no-underline hover:bg-[oklch(100%_0_0_/_0.06)]"
            to="/settings"
          >
            <Settings size={14} />
            Settings
          </Link>
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
