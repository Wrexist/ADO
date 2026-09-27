import { restoreBackup } from '../apps/server/src/backup/index.ts';
import { resolve } from 'node:path';
const [file, destination] = process.argv.slice(2);
if (!file || !destination) throw new Error('Usage: npm run restore -- BACKUP.sqlite NEW_PROFILE_DIRECTORY');
restoreBackup(resolve(file), resolve(destination));
console.log(`Restored to ${resolve(destination)} in recovery review mode. Existing profiles were not changed. Jobs and mutations remain paused. Credentials and local workspaces were not restored. Set DB_PATH to its acc.sqlite, or launch desktop with --profile-dir=${resolve(destination)}, to inspect the restored data.`);
