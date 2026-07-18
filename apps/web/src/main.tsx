import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
// Self-hosted Inter (@fontsource) — must render offline; weights 400/500/600 only.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import { CommandPage } from './pages/CommandPage';
import { OpsPage } from './pages/OpsPage';
import { KitPage } from './pages/KitPage';
import { SettingsPage } from './pages/SettingsPage';
import { PromptsPage } from './pages/PromptsPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { ProjectPage } from './pages/ProjectPage';
import { AgentsPage } from './pages/AgentsPage';
import { DeploymentsPage } from './pages/DeploymentsPage';
import { ActivityPage } from './pages/ActivityPage';
import { SetupPage } from './pages/SetupPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { PerformancePage } from './pages/PerformancePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { CommandPalette } from './chrome/CommandPalette';
import { ErrorBoundary } from './chrome/ErrorBoundary';
import { startBus } from './bus/connect';
import './index.css';

// Connect to the event bus (SSE) — the only data source views render from.
startBus();

/** Routes wrapped in the root error boundary; the pathname is its reset key, so navigating
 *  away from a crashed screen recovers the app instead of leaving the fallback stuck. */
function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/command" replace />} />
        <Route path="/command" element={<CommandPage />} />
        <Route path="/ops" element={<OpsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/repositories" element={<RepositoriesPage />} />
        <Route path="/repositories/:id" element={<ProjectPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/deployments" element={<DeploymentsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/automations" element={<AutomationsPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/diagnostics" element={<DiagnosticsPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/planned/:slug" element={<PlaceholderPage />} />
        {/* kit demo — every component in every state (gate p1 criterion) */}
        <Route path="/kit" element={<KitPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CommandPalette />
      <AppRoutes />
    </BrowserRouter>
  </React.StrictMode>,
);
