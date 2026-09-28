CREATE TABLE context_packages (
 id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL REFERENCES planning_tasks(id), task_version INTEGER NOT NULL,
 checkout_id TEXT NOT NULL REFERENCES portfolio_checkouts(id), base_sha TEXT NOT NULL,
 request_hash TEXT NOT NULL, digest TEXT NOT NULL, payload_json TEXT NOT NULL, created_ts TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE context_package_reviews (
 id TEXT PRIMARY KEY NOT NULL, package_id TEXT NOT NULL REFERENCES context_packages(id), version INTEGER NOT NULL,
 digest TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL, recorded_ts TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX context_review_version ON context_package_reviews(package_id, version);
--> statement-breakpoint
CREATE TRIGGER context_package_no_update BEFORE UPDATE ON context_packages BEGIN SELECT RAISE(ABORT, 'Context package is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER context_package_no_delete BEFORE DELETE ON context_packages BEGIN SELECT RAISE(ABORT, 'Context package history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER context_review_no_update BEFORE UPDATE ON context_package_reviews BEGIN SELECT RAISE(ABORT, 'Context review is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER context_review_no_delete BEFORE DELETE ON context_package_reviews BEGIN SELECT RAISE(ABORT, 'Context review history is immutable'); END;
