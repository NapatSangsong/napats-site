-- Knowledge graph: AI-detected relationships between courses

create table course_relationships (
  id uuid primary key default gen_random_uuid(),
  from_course_id uuid not null references courses(id) on delete cascade,
  to_course_id uuid not null references courses(id) on delete cascade,
  relationship text not null,
  strength numeric not null default 0.5,
  generated_by_model text,
  created_at timestamptz not null default now(),
  unique(from_course_id, to_course_id)
);

create index idx_course_rel_from on course_relationships(from_course_id);
create index idx_course_rel_to on course_relationships(to_course_id);
