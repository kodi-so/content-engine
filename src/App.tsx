import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth, useUser, SignOutButton } from "@clerk/clerk-react";
import {
  Home as HomeIcon,
  Library as LibraryIcon,
  BarChart3,
  Zap,
  Settings as SettingsIcon,
  Layers,
  Video,
  Users,
  Calendar,
  LogOut,
} from "lucide-react";

// Pages
import Home from "./pages/Home";
import Library from "./pages/Library";
import Analytics from "./pages/Analytics";
import Automations from "./pages/Automations";
import Slideshows from "./pages/Slideshows";
import HookDemo from "./pages/HookDemo";
import AIUGC from "./pages/AIUGC";
import SettingsPage from "./pages/Settings";
import Landing from "./pages/Landing";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import ProtectedRoute from "./components/ProtectedRoute";

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const generalNavItems = [
    { path: "/dashboard", label: "Home", icon: HomeIcon },
    { path: "/library", label: "Library", icon: LibraryIcon },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/automations", label: "Automations", icon: Calendar },
  ];

  const playgroundNavItems = [
    { path: "/slideshows", label: "Slideshows", icon: Layers },
    { path: "/hook-demo", label: "Hook + Demo", icon: Video },
    { path: "/ai-ugc", label: "AI UGC", icon: Users },
  ];

  // Show loading spinner while Clerk is loading
  if (!isLoaded) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#f9fafb",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            border: "3px solid #e5e7eb",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Show landing page on root path (for both authenticated and unauthenticated users)
  if (location.pathname === "/") {
    return <Landing />;
  }

  // Show public pages without sidebar
  if (location.pathname === "/privacy") {
    return <Privacy />;
  }
  if (location.pathname === "/terms") {
    return <Terms />;
  }


  // For any other route, use ProtectedRoute to handle auth
  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div
          className="sidebar-logo"
          onClick={() => navigate("/")}
          style={{ cursor: "pointer" }}
        >
          <Zap size={20} style={{ display: "inline", marginRight: "0.5rem" }} />
          Content Engine
        </div>

        <nav className="sidebar-nav">
          {generalNavItems.map((item) => (
            <div
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? "active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <item.icon size={18} />
              {item.label}
            </div>
          ))}

          {/* Playground Section */}
          <div style={{ marginTop: "1.5rem", marginBottom: "0.5rem", padding: "0 1rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Playground
            </div>
          </div>

          {playgroundNavItems.map((item) => (
            <div
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? "active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <item.icon size={18} />
              {item.label}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
          <div
            className={`nav-item ${location.pathname === "/settings" ? "active" : ""}`}
            onClick={() => navigate("/settings")}
          >
            <SettingsIcon size={18} />
            Settings
          </div>

          {/* User Menu */}
          {user && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1rem",
                borderTop: "1px solid #374151",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                {user.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.fullName || "User"}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "#3b82f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    }}
                  >
                    {user.fullName?.[0] || user.primaryEmailAddress?.emailAddress?.[0] || "U"}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      color: "#fff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.fullName || "User"}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.primaryEmailAddress?.emailAddress}
                  </div>
                </div>
              </div>
              <SignOutButton signOutOptions={{ redirectUrl: "/" }}>
                <button
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    backgroundColor: "transparent",
                    border: "1px solid #374151",
                    borderRadius: "6px",
                    color: "#9ca3af",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </SignOutButton>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Home onNavigate={(path) => navigate(path)} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library"
            element={
              <ProtectedRoute>
                <Library onNavigate={(path) => navigate(path)} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/automations"
            element={
              <ProtectedRoute>
                <Automations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/slideshows"
            element={
              <ProtectedRoute>
                <Slideshows />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hook-demo"
            element={
              <ProtectedRoute>
                <HookDemo />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-ugc"
            element={
              <ProtectedRoute>
                <AIUGC />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
