import { useAuth } from "@clerk/clerk-react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Sidebar } from "./components/AppShell";
import { LoadingScreen, SignInScreen } from "./components/ui";
import { AccountsPage } from "./pages/AccountsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { BrandsPage } from "./pages/BrandsPage";
import { CreatePage } from "./pages/CreatePage";
import { Dashboard } from "./pages/Dashboard";
import { LibraryPage } from "./pages/LibraryPage";
import { PersonasPage } from "./pages/PersonasPage";
import { RunsPage } from "./pages/RunsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkflowCanvasPage } from "./pages/WorkflowCanvasPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";

function AppContent() {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  const isWorkflowCanvasRoute = /^\/workflows\/[^/]+/.test(location.pathname);

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <SignInScreen />;

  return (
    <div className={`app-shell${isWorkflowCanvasRoute ? " app-shell-canvas" : ""}`}>
      <Sidebar />
      <main className="workspace">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/personas" element={<PersonasPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/:workflowId" element={<WorkflowCanvasPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
