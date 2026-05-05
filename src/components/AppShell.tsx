import { SignOutButton, useUser } from "@clerk/clerk-react";
import { BrainCircuit, LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";
import { navItems } from "../app/navigation";

export function Sidebar() {
  const { user } = useUser();

  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <BrainCircuit size={22} />
        <span>Content Engine</span>
      </div>

      <nav className="nav-list">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
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
  );
}
