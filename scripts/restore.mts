import { restoreBackup } from '../apps/server/src/backup/index.ts';
import { resolve } from 'node:path';
const [file, destination] = process.argv.slice(2);
if (!file || !destination) throw new Error('Usage: npm run restore -- BACKUP.sqlite NEW_PROFILE_DIRECTORY');
restoreBackup(resolve(file), resolve(destination));
console.log(`Restored to ${resolve(destination)}. Existing profiles were not changed. Set DB_PATH to its acc.sqlite before starting the server.`);
