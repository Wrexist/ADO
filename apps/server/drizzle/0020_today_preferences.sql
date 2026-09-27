CREATE TABLE today_preferences (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'local'),
  version INTEGER NOT NULL CHECK (version > 0),
  choices_json TEXT NOT NULL,
  updated_ts TEXT NOT NULL
);
