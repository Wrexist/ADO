import { useEffect, useState, type ReactNode } from 'react';
import { ACC_TOKEN, IS_DESKTOP, SERVER_URL, setBrowserToken } from '../lib/config';
import { startBus, stopBus } from '../bus/connect';

/** Pair explicitly; public assets and URLs never carry the browser's credential. */
export function PairingGate({ children }: { children: ReactNode }) {
  const [paired, setPaired] = useState(IS_DESKTOP);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!paired) return;
    startBus();
    return stopBus;
  }, [paired]);

  if (paired) return <>
    {!IS_DESKTOP && <button className="fixed bottom-3 right-3 z-50 rounded border bg-card px-3 py-2 text-body text-text2" onClick={() => {
      stopBus(); setBrowserToken(''); setPaired(false);
    }}>Disconnect browser</button>}
    {children}
  </>;

  return <main className="flex min-h-screen items-center justify-center bg-app p-6 text-text1">
    <form className="w-full max-w-md space-y-4 rounded-panel border bg-card p-6" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        const response = await fetch(`${SERVER_URL}/api/session`, { method: 'POST', headers: { 'x-acc-token': token.trim() } });
        if (!response.ok) throw new Error(response.status === 401 ? 'That access key was not accepted.' : 'The server could not connect this browser.');
        setBrowserToken(token.trim()); setToken(''); setPaired(Boolean(ACC_TOKEN));
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not reach the server.'); }
      finally { setBusy(false); }
    }}>
      <h1 className="text-title font-semibold">Connect to ControlOS</h1>
      <p className="text-body text-text2">Enter the access key from ACC_TOKEN in your local .env file. The desktop app connects automatically. Browser access lasts until you disconnect or reload this page.</p>
      <label className="block text-body">Access key<input autoComplete="off" type="password" required value={token} onChange={(e) => setToken(e.target.value)} className="mt-2 w-full rounded border bg-app p-3" /></label>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <button disabled={busy} className="rounded border px-4 py-2 disabled:opacity-50">{busy ? 'Connecting…' : 'Connect'}</button>
    </form>
  </main>;
}
