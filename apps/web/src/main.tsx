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
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Navigate to="/command" replace />} />
        <Route path="/command" element={<CommandPage />} />
        <Route path="/ops" element={<OpsPage />} />
        {/* kit demo — every component in every state (gate p1 criterion) */}
        <Route path="/kit" element={<KitPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
