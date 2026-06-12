-- 009: Enable Row Level Security on all learning tables (Supabase advisor: critical).
-- The app accesses these tables exclusively through the service_role key on the
-- server (app/lib/supabase.server.ts), which bypasses RLS — so no policies are
-- needed and app behavior is unchanged. With RLS on and no policies, the anon key
-- can no longer read or write any row. Same hardening already applied to the
-- energy tables.

alter table sessions enable row level security;
alter table courses enable row level security;
alter table lessons enable row level security;
alter table lesson_blocks enable row level security;
alter table lesson_block_history enable row level security;
alter table lesson_progress enable row level security;
alter table lesson_notes enable row level security;
alter table lesson_journal enable row level security;
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table quizzes enable row level security;
alter table quiz_attempts enable row level security;
alter table settings enable row level security;
alter table review_schedule enable row level security;
alter table course_relationships enable row level security;
alter table course_glossary enable row level security;
