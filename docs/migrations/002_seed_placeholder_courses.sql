-- Seed 2 placeholder courses so the Library has content during development.
-- Safe to re-run (uses ON CONFLICT).

INSERT INTO courses (slug, title, subtitle, description, source, language, difficulty, estimated_minutes, tags, cover_monogram)
VALUES
  ('wim-hof-science', 'Wim Hof · The Science', 'cold, breath, and the autonomic nervous system', 'An AI-generated deep dive into the Wim Hof method — the vagus nerve, breathing protocols, and cold exposure.', 'ai', 'th', 'intermediate', 240, ARRAY['science', 'health', 'biology'], 'W'),
  ('css-grid-mastery', 'The Grammar of CSS Grid', 'six lessons to layout fluency', 'From track sizing to subgrid — everything you need to stop fighting CSS layout.', 'ai', 'th', 'beginner', 120, ARRAY['css', 'frontend', 'layout'], 'G')
ON CONFLICT (slug) DO NOTHING;

-- Add lessons for the first course
INSERT INTO lessons (course_id, order_index, title, summary, outcomes, status)
SELECT c.id, v.order_index, v.title, v.summary, v.outcomes, 'pending'
FROM courses c,
(VALUES
  (1, 'The wanderer', 'The vagus nerve and why it matters', ARRAY['Understand cranial nerve X', 'Describe the autonomic nervous system']),
  (2, 'Breathing, measured', 'The hyperventilation protocol', ARRAY['Perform 3 rounds of WHM breathing', 'Explain respiratory alkalosis']),
  (3, 'Cold as information', 'What cold exposure teaches the body', ARRAY['Describe vasoconstriction response', 'Explain norepinephrine release']),
  (4, 'The autonomic dial', 'Sympathetic vs parasympathetic', ARRAY['Distinguish fight-or-flight from rest-and-digest']),
  (5, 'Inflammation, quieted', 'The immune modulation research', ARRAY['Cite the 2014 PNAS study']),
  (6, 'Practice without faith', 'Building a daily protocol', ARRAY['Design a personal WHM routine']),
  (7, 'Closing frame', 'Integration and reflection', ARRAY['Synthesize the course material'])
) AS v(order_index, title, summary, outcomes)
WHERE c.slug = 'wim-hof-science'
ON CONFLICT (course_id, order_index) DO NOTHING;

-- Add lessons for the second course
INSERT INTO lessons (course_id, order_index, title, summary, outcomes, status)
SELECT c.id, v.order_index, v.title, v.summary, v.outcomes, 'pending'
FROM courses c,
(VALUES
  (1, 'The mental model', 'How CSS Grid thinks about space', ARRAY['Understand grid container vs items']),
  (2, 'Track sizing', 'fr, minmax, auto-fill, auto-fit', ARRAY['Use fractional units effectively']),
  (3, 'Placement', 'Line-based and area-based placement', ARRAY['Place items using grid-column and grid-row']),
  (4, 'Alignment', 'justify and align in two dimensions', ARRAY['Center anything with Grid']),
  (5, 'Responsive patterns', 'No media queries needed', ARRAY['Build responsive layouts without breakpoints']),
  (6, 'Subgrid', 'Nested grids that inherit tracks', ARRAY['Use subgrid for aligned nested layouts'])
) AS v(order_index, title, summary, outcomes)
WHERE c.slug = 'css-grid-mastery'
ON CONFLICT (course_id, order_index) DO NOTHING;
