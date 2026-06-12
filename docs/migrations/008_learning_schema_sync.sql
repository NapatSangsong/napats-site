-- 008: Sync repo with tables that were applied directly to prod but never committed.
-- These three tables already exist in the NapatsDev project; this file restores the
-- repo as the source of truth (the original "006_lesson_notes.sql" was never committed
-- and the 006 number was later reused by 006_energy_readings.sql).
-- Note: course_glossary has no code referencing it (candidate for removal).

-- Personal sticky notes per lesson block (app/routes/api/notes.ts)
create table if not exists lesson_notes (
	id uuid primary key default gen_random_uuid(),
	lesson_id uuid not null references lessons(id) on delete cascade,
	block_index int,
	content text not null,
	color text default 'default',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists idx_lesson_notes_lesson on lesson_notes(lesson_id);

-- Reflection journal + teach-it-back entries (app/routes/api/journal.ts)
create table if not exists lesson_journal (
	id uuid primary key default gen_random_uuid(),
	lesson_id uuid not null references lessons(id) on delete cascade,
	kind text not null default 'reflection' check (kind in ('reflection', 'teach_back')),
	content text not null,
	ai_feedback jsonb,
	created_at timestamptz not null default now()
);
create index if not exists lesson_journal_lesson_id_idx on lesson_journal(lesson_id);

-- Glossary terms per course — currently unreferenced by app code
create table if not exists course_glossary (
	id uuid primary key default gen_random_uuid(),
	course_id uuid not null references courses(id) on delete cascade,
	term text not null,
	definition text not null,
	first_lesson_id uuid references lessons(id) on delete set null,
	first_block_index int,
	created_at timestamptz not null default now()
);
create index if not exists course_glossary_course_id_idx on course_glossary(course_id);
