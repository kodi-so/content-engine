import { useAuth, useUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { api } from "../convex/_generated/api";
import { Sidebar } from "./components/AppShell";
import { LoadingScreen, PrivateBetaScreen, SignInScreen } from "./components/ui";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { AccountsPage } from "./pages/AccountsPage";
import { AnalyzePage } from "./pages/AnalyzePage";
import { CreatePage } from "./pages/CreatePage";
import { CreateToolsPage } from "./pages/CreateToolsPage";
import { LandingPage } from "./pages/LandingPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SlideshowEditorPage } from "./pages/SlideshowEditorPage";
import { VideoComposerPage } from "./pages/VideoComposerPage";
import { WorkflowCanvasPage } from "./pages/WorkflowCanvasPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";

function AppContent() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const location = useLocation();
  const ensureCurrentUser = useMutation(api.auth.users.ensure);
  const requestAccess = useMutation(api.waitlist.requestAccess);
  const isFullScreenWorkspaceRoute = /^\/workflows\/[^/]+/.test(location.pathname) ||
    location.pathname === "/studio";
  const [accessStatus, setAccessStatus] = useState<"checking" | "approved" | "pending">(
    "checking"
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setAccessStatus("checking");
      return;
    }

    let canceled = false;
    setAccessStatus("checking");
    void ensureCurrentUser()
      .then(() => {
        if (!canceled) setAccessStatus("approved");
      })
      .catch(() => {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (email) {
          void requestAccess({
            email,
            name: user?.fullName ?? undefined,
            source: "signed-in-gate",
          });
        }
        if (!canceled) setAccessStatus("pending");
      });

    return () => {
      canceled = true;
    };
  }, [ensureCurrentUser, isLoaded, isSignedIn, requestAccess, user]);

  if (!isLoaded) return <LoadingScreen />;

  if (location.pathname === "/" && !isSignedIn) {
    return <LandingPage />;
  }

  if (!isSignedIn) return <SignInScreen />;
  if (accessStatus === "checking") return <LoadingScreen />;
  if (accessStatus === "pending") return <PrivateBetaScreen />;

  if (location.pathname === "/") {
    return <Navigate to="/create" replace />;
  }

  return (
    <WorkspaceProvider>
      <div className={`app-shell${isFullScreenWorkspaceRoute ? " app-shell-canvas" : ""}`}>
        <Sidebar />
        <main className="workspace">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="/tools" element={<CreateToolsPage />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="/studio" element={<VideoComposerPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/workflows/:workflowId" element={<WorkflowCanvasPage />} />
            <Route path="/slideshows/:slideshowId" element={<SlideshowEditorPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/create" replace />} />
          </Routes>
        </main>
      </div>
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
