-- Spaced repetition review schedule
-- Tracks when lessons are due for review at expanding intervals

create table review_schedule (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  interval_days int not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  score numeric,
  created_at timestamptz not null default now()
);

create index idx_review_schedule_due on review_schedule(due_at) where completed_at is null;
create index idx_review_schedule_lesson on review_schedule(lesson_id);
