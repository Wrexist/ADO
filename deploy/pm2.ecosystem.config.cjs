/**
 * pm2 process config for the AI Control Center (cross-platform autostart).
 *
 *   npm run build                                   # web needs a dist/ for preview
 *   pm2 start deploy/pm2.ecosystem.config.cjs
 *   pm2 save && pm2 startup                         # follow the printed command → autostart on login
 *
 * Runs two always-on processes: the server (the data collector — the p6 criterion) and a
 * static web preview so the dashboard is reachable at http://localhost:5173 after a reboot.
 * Secrets come from the repo-root .env (gitignored); nothing is baked in here.
 */
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'acc-server',
      cwd: root,
      script: 'npm',
      args: 'run start -w @ado/server',
      interpreter: 'none', // run npm directly, not through node
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'acc-web',
      cwd: root,
      script: 'npm',
      args: 'run preview -w @ado/web',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
