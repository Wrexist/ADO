-- Existing quarantines are preserved even if an older profile exceeds the limit.
-- No new writer may claim capacity until fewer than two owners remain.
CREATE TRIGGER execution_capacity BEFORE INSERT ON execution_locks
WHEN (SELECT COUNT(*) FROM execution_locks) >= 2
BEGIN SELECT RAISE(ABORT, 'Execution capacity occupied by active or quarantined writers (limit 2)'); END;
