-- Learning platform schema
-- Run against the Supabase project via SQL editor or `psql`.

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Sessions (per-device tracking, optional revoke)
create table sessions (
  dev_id text primary key,
  label text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Courses
create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  description text,
  source text not null check (source in ('ai', 'manual')),
  language text not null default 'th',
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  estimated_minutes int,
  tags text[] not null default '{}',
  cover_monogram text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);
create index on courses(source);
create index on courses(archived);

-- Lessons
create table lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  order_index int not null,
  title text not null,
  summary text,
  outcomes text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'edited')),
  generated_at timestamptz,
  generated_by_model text,
  unique(course_id, order_index)
);

-- Content blocks (one lesson = ordered list of blocks)
create table lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  order_index int not null,
  kind text not null check (kind in ('prose', 'heading', 'mermaid', 'katex', 'code', 'interactive', 'callout', 'image', 'quote')),
  content jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on lesson_blocks(lesson_id, order_index);

-- Block edit history (for undo)
create table lesson_block_history (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references lesson_blocks(id) on delete cascade,
  version int not null,
  kind text not null,
  content jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Progress (1 row per lesson; single user = no user_id column)
create table lesson_progress (
  lesson_id uuid primary key references lessons(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  scroll_percent numeric not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  last_accessed_at timestamptz not null default now()
);

-- Chat threads (scoped to course / lesson / block)
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('course', 'lesson', 'block')),
  scope_id uuid not null,
  title text,
  created_at timestamptz not null default now()
);
create index on chat_threads(scope, scope_id);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  model text,
  tokens_input int,
  tokens_output int,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on chat_messages(thread_id, created_at);

-- Quizzes
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  questions jsonb not null,
  generated_by_model text,
  created_at timestamptz not null default now()
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  answers jsonb not null,
  score numeric,
  feedback jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Settings (single-row key-value store)
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Seed default settings
insert into settings (key, value) values
  ('default_model', '"claude-sonnet-4-6"'),
  ('language', '"th"'),
  ('theme', '"dark"'),
  ('auto_routing', 'true')
on conflict do nothing;

-- Updated-at triggers
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger courses_touch before update on courses
  for each row execute function touch_updated_at();
create trigger lesson_blocks_touch before update on lesson_blocks
  for each row execute function touch_updated_at();
