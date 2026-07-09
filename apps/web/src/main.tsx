import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App, PhasePlaceholder } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/command" replace />} />
          <Route path="command" element={<PhasePlaceholder view="Command Center" route="/command" />} />
          <Route path="ops" element={<PhasePlaceholder view="Ops Dashboard" route="/ops" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
