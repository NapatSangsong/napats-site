-- Socratic active recall checkpoint columns on lesson_progress

alter table lesson_progress add column recall_status text
  check (recall_status in ('pending', 'in_progress', 'confirmed'))
  default 'pending';

alter table lesson_progress add column recall_score numeric;
alter table lesson_progress add column recall_confirmed_at timestamptz;
