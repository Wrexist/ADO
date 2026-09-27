CREATE TABLE planning_milestones (
 id text PRIMARY KEY NOT NULL, project_id text NOT NULL REFERENCES portfolio_projects(id),
 title text NOT NULL, exit_criteria_json text NOT NULL, status text NOT NULL,
 version integer NOT NULL, created_ts text NOT NULL, updated_ts text NOT NULL
);
--> statement-breakpoint
CREATE TABLE planning_tasks (
 id text PRIMARY KEY NOT NULL, project_id text NOT NULL REFERENCES portfolio_projects(id),
 repository_id text REFERENCES portfolio_repositories(id), milestone_id text REFERENCES planning_milestones(id),
 title text NOT NULL, outcome text NOT NULL, scope text NOT NULL, out_of_scope text NOT NULL,
 acceptance_json text NOT NULL, source_refs_json text NOT NULL, priority integer NOT NULL, status text NOT NULL,
 version integer NOT NULL, created_ts text NOT NULL, updated_ts text NOT NULL
);
--> statement-breakpoint
CREATE TABLE planning_dependencies (
 task_id text NOT NULL REFERENCES planning_tasks(id), depends_on text NOT NULL REFERENCES planning_tasks(id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX planning_dependency_identity ON planning_dependencies(task_id, depends_on);
--> statement-breakpoint
CREATE TABLE planning_inbox (
 id text PRIMARY KEY NOT NULL, idempotency_key text NOT NULL UNIQUE, request_hash text NOT NULL,
 text text NOT NULL, project_id text REFERENCES portfolio_projects(id), task_id text REFERENCES planning_tasks(id),
 promotion_hash text, status text NOT NULL, version integer NOT NULL, created_ts text NOT NULL, updated_ts text NOT NULL
);
--> statement-breakpoint
CREATE TABLE planning_revisions (
 id text PRIMARY KEY NOT NULL, entity_id text NOT NULL, kind text NOT NULL, version integer NOT NULL,
 snapshot_json text NOT NULL, recorded_ts text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX planning_revision_identity ON planning_revisions(entity_id, version);
--> statement-breakpoint
CREATE TRIGGER planning_revisions_no_update BEFORE UPDATE ON planning_revisions BEGIN SELECT RAISE(ABORT, 'Planning revision is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER planning_revisions_no_delete BEFORE DELETE ON planning_revisions BEGIN SELECT RAISE(ABORT, 'Planning revision is immutable'); END;
