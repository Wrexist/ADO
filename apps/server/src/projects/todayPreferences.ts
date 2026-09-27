import { and, eq } from 'drizzle-orm';
import { TodayPreferences, TodayPreferencesWrite } from '@ado/shared';
import type { Db } from '../db';
import { todayPreferences } from '../db/schema';

/** Explicit profile-local preferences; reading never repairs or overwrites data. */
export class TodayPreferencesStore {
  constructor(private db: Db) {}
  read(): TodayPreferences {
    const row = this.db.select().from(todayPreferences).where(eq(todayPreferences.id, 'local')).get();
    if (!row) return { version: 0, updatedTs: null, availableMinutes: 30, projectId: null, lockedTaskId: null, estimates: [] };
    try { return TodayPreferences.parse({ ...JSON.parse(row.choicesJson), version: row.version, updatedTs: row.updatedTs }); }
    catch { throw new Error('Saved Today choices are invalid; inspect this profile before saving'); }
  }
  save(input: unknown, validate: (choices: unknown) => void): TodayPreferences {
    const { version, ...choices } = TodayPreferencesWrite.parse(input);
    return this.db.transaction(() => {
      const current = this.read();
      if (current.version !== version) throw new Error('Saved Today choices changed; load them before saving again');
      validate(choices);
      const row = { id: 'local', version: version + 1, choicesJson: JSON.stringify(choices), updatedTs: new Date().toISOString() };
      if (version === 0) this.db.insert(todayPreferences).values(row).run();
      else if (this.db.update(todayPreferences).set(row).where(and(eq(todayPreferences.id, 'local'), eq(todayPreferences.version, version))).run().changes !== 1) throw new Error('Saved Today choices changed; reload before saving');
      return TodayPreferences.parse({ ...choices, version: row.version, updatedTs: row.updatedTs });
    });
  }
}
