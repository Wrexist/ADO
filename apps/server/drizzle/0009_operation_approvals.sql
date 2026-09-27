CREATE TABLE `approval_policy_versions` (
  `version` text PRIMARY KEY NOT NULL,
  `repo_id` text NOT NULL,
  `digest` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `created_ts` text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `approval_policy_versions_no_update` BEFORE UPDATE ON `approval_policy_versions`
BEGIN SELECT RAISE(ABORT, 'Policy snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `approval_policy_versions_no_delete` BEFORE DELETE ON `approval_policy_versions`
BEGIN SELECT RAISE(ABORT, 'Policy snapshots are append-only'); END;
--> statement-breakpoint
CREATE TABLE `approval_policies` (
  `repo_id` text PRIMARY KEY NOT NULL,
  `version` text NOT NULL REFERENCES `approval_policy_versions` (`version`),
  `digest` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operation_approvals` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text NOT NULL,
  `operation` text NOT NULL,
  `run_id` text NOT NULL,
  `repo_id` text NOT NULL,
  `head_sha` text NOT NULL,
  `diff_digest` text NOT NULL,
  `payload_hash` text NOT NULL,
  `payload_json` text NOT NULL,
  `policy_version` text NOT NULL REFERENCES `approval_policy_versions` (`version`),
  `issued_ts` text NOT NULL,
  `expires_ts` text NOT NULL,
  `consumed_ts` text,
  `revoked_ts` text,
  `revoke_reason` text,
  CHECK (`consumed_ts` IS NULL OR `revoked_ts` IS NULL)
);
--> statement-breakpoint
CREATE INDEX `operation_approvals_run_idx` ON `operation_approvals` (`run_id`, `issued_ts`);
--> statement-breakpoint
CREATE TRIGGER `operation_approvals_immutable` BEFORE UPDATE ON `operation_approvals`
WHEN OLD.id IS NOT NEW.id OR OLD.actor_id IS NOT NEW.actor_id OR OLD.operation IS NOT NEW.operation
  OR OLD.run_id IS NOT NEW.run_id OR OLD.repo_id IS NOT NEW.repo_id OR OLD.head_sha IS NOT NEW.head_sha
  OR OLD.diff_digest IS NOT NEW.diff_digest OR OLD.payload_hash IS NOT NEW.payload_hash
  OR OLD.payload_json IS NOT NEW.payload_json OR OLD.policy_version IS NOT NEW.policy_version
  OR OLD.issued_ts IS NOT NEW.issued_ts OR OLD.expires_ts IS NOT NEW.expires_ts
  OR OLD.consumed_ts IS NOT NULL OR OLD.revoked_ts IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Approval binding and terminal decisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `operation_approvals_no_delete` BEFORE DELETE ON `operation_approvals`
BEGIN SELECT RAISE(ABORT, 'Approval history is append-only'); END;
