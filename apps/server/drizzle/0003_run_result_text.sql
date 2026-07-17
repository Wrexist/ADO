-- Persist the agent's final message (capped server-side) so past runs keep their report
-- across restarts. Nullable: streams that carried no final text stay honestly null.
ALTER TABLE `runs` ADD `result_text` text;
