-- Deletes every user except the four accounts seeded in supabase-schema.sql.
-- Related rows with ON DELETE CASCADE are deleted as well.

BEGIN;

DELETE FROM users
WHERE id NOT IN (
  'a0000000-0000-0000-0000-000000000001', -- Admin
  'c0000000-0000-0000-0000-000000000001', -- Dean
  'd0000000-0000-0000-0000-000000000001', -- Faculty
  'd0000000-0000-0000-0000-000000000002'  -- Student
);

COMMIT;