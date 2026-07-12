import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { AgentsPage } from './pages/AgentsPage';
import { DeploymentsPage } from './pages/DeploymentsPage';
import { ActivityPage } from './pages/ActivityPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { CommandPalette } from './chrome/CommandPalette';
import { startBus } from './bus/connect';
import './index.css';

// Connect to the event bus (SSE) — the only data source views render from.
startBus();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CommandPalette />
      <Routes>
        <Route path="/" element={<Navigate to="/command" replace />} />
        <Route path="/command" element={<CommandPage />} />
        <Route path="/ops" element={<OpsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/repositories" element={<RepositoriesPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/deployments" element={<DeploymentsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/planned/:slug" element={<PlaceholderPage />} />
        {/* kit demo — every component in every state (gate p1 criterion) */}
        <Route path="/kit" element={<KitPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
