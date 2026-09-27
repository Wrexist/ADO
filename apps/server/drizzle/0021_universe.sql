CREATE TABLE universe_resources (
 id TEXT PRIMARY KEY NOT NULL, project_id TEXT REFERENCES portfolio_projects(id),
 title TEXT NOT NULL, reference TEXT NOT NULL, source TEXT NOT NULL,
 version INTEGER NOT NULL, created_ts TEXT NOT NULL, deleted_ts TEXT
);
--> statement-breakpoint
CREATE TABLE universe_relations (
 id TEXT PRIMARY KEY NOT NULL, from_key TEXT NOT NULL, to_key TEXT NOT NULL,
 kind TEXT NOT NULL, source TEXT NOT NULL, version INTEGER NOT NULL, created_ts TEXT NOT NULL, deleted_ts TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX universe_relation_identity ON universe_relations(from_key, to_key, kind) WHERE deleted_ts IS NULL;
