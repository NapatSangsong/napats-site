# Learning Platform Enhancement Plan — 13 Features

**Date:** 2026-04-22
**Author:** Claude Opus 4.6 + Napat Sangsong
**Status:** Awaiting approval

## Current State

- 14 database tables, 20 API endpoints, 13 AI prompts
- AI: OpenRouter (Gemini Flash/Pro + free fallbacks) + Claude Haiku fallback
- Budget: ~$10/month via OpenRouter
- Latest migration: 006_lesson_notes.sql

---

## Feature Summary

| # | Feature | Uses AI? | New Tables | New API Routes | Est $/call |
|---|---------|----------|-----------|----------------|-----------|
| A1 | Export / Import Course | No | — | 2 | $0 |
| A2 | Cross-Course Linking | Yes | — | 1 | ~$0.005 |
| A3 | Glossary / Term Bank | Yes | 1 | 1 | ~$0.02 |
| B1 | Pre-Lesson Self-Assessment | Yes (re-gen) | — | — | ~$0.04 |
| B2 | Confidence Tracking | No | — | — | $0 |
| B3 | Lesson Time Estimate | No | — | — | $0 |
| B4 | "I'm Stuck" Button | Yes (refine) | — | 1 | ~$0.01 |
| C1 | Focus Mode / Pomodoro | No | — | — | $0 |
| C2 | Keyboard Shortcuts | No | — | — | $0 |
| C3 | Smart Breadcrumbs | No | — | — | $0 |
| D1 | Learning Journal | Yes (digest) | 1 | 1 | ~$0.01 |
| D2 | Teach It Back | Yes | — | 1 | ~$0.02 |
| E1 | AI Comparison Mode | Yes (2×) | — | — | 2× normal |

---

## Phase 1 — Foundation (no AI, high daily value)

**Features:** B3 (Time tracking), C2 (Keyboard shortcuts), C3 (Breadcrumbs)

### B3: Lesson Time Estimate (Actual)

**Files modified:**
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — add timer logic
- `app/routes/api/progress.$lessonId.ts` — accept `time_spent_seconds`
- `app/routes/learning.progress.tsx` — show actual vs estimated

**Schema (migration 007):**
```sql
ALTER TABLE lesson_progress ADD COLUMN time_spent_seconds int DEFAULT 0;
ALTER TABLE lesson_progress ADD COLUMN last_timer_tick timestamptz;
```

**Settings:** `pace_multiplier` in settings table (default 1.0)

**Implementation:**
- `useEffect` with `document.visibilityState` + focus/blur listeners
- Tick every 10s when active, pause on blur/idle (no scroll/click for 60s)
- PUT to progress API every 30s with accumulated seconds
- Display: "AI estimated 20 min · You spent 34 min"
- After 5 completed lessons, calculate pace multiplier

### C2: Keyboard Shortcuts + Command Palette

**Files modified:**
- `app/routes/learning.tsx` — global keydown listener
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — lesson shortcuts

**New file:**
- `app/components/learning/CommandPalette.tsx` — fuzzy search modal
- `app/components/learning/ShortcutsHelp.tsx` — help modal

**Shortcuts:**
- `?` — help modal
- `⌘K` / `Ctrl+K` — command palette
- `j` / `k` — next/prev lesson
- `g h` — home, `g l` — library, `g p` — progress
- `/` — focus chat, `n` — new note

**Command palette:**
- Fuzzy search across courses, lessons, commands
- Recent items at top
- `Esc` to close

### C3: Smart Breadcrumbs + Resume

**Files modified:**
- `app/routes/learning._index.tsx` — resume card
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — breadcrumb bar + scroll restore

**Implementation:**
- `localStorage` key: `napats-learning-history` (array of {path, title, scrollPercent, timestamp})
- Max 10 entries, sorted by recency
- Resume card on home page if `last_accessed_at` within 30 days
- Breadcrumb bar below lesson header showing last 5 locations
- Scroll position restored on mount via `contentRef.scrollTo()`

---

## Phase 2 — Data Safety & Portability

**Features:** A1 (Export/Import), A3 (Glossary)

### A1: Export / Import Course

**New files:**
- `app/routes/api/export.ts` — GET `/learning/api/export?courseId=xxx&format=json|md|pdf`
- `app/routes/api/import.ts` — POST `/learning/api/import` (multipart)
- `app/routes/learning.courses.$slug.tsx` — export buttons on course page

**Export formats:**
- **JSON:** course + lessons + blocks + notes + progress + quizzes (single file)
- **Markdown:** zip with `index.md` + `lesson-00.md`, `lesson-01.md`, etc.
- **PDF:** print-friendly HTML route, `window.print()`

**Import:**
- Library page gets "Import Course" button
- File picker → preview → confirm → create course with `source = 'imported'`

### A3: Glossary / Term Bank

**Schema (migration 008):**
```sql
CREATE TABLE course_glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  term text NOT NULL,
  definition text NOT NULL,
  first_lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  first_block_index int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON course_glossary(course_id);
```

**New files:**
- `app/routes/api/ai.glossary.ts` — POST to extract terms from all lesson blocks
- `app/routes/learning.courses.$slug.glossary.tsx` — glossary page
- `app/lib/ai/prompts/extractGlossary.ts` — prompt

**New route:** `learning/courses/:slug/glossary`

**Implementation:**
- After course is fully generated, "Build Glossary" button
- AI scans all lesson blocks, extracts 20-50 key terms + definitions
- Hover tooltip in lesson viewer for glossary terms (similar to `<hyper>` tags)
- Auto-rebuild on lesson regeneration

---

## Phase 3 — Adaptive Learning

**Features:** B1 (Self-Assessment), B4 (I'm Stuck)

### B1: Pre-Lesson Self-Assessment

**Schema (migration 009):**
```sql
ALTER TABLE lesson_progress ADD COLUMN self_assessment int;
```

**Files modified:**
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — modal on first open
- `app/lib/ai/prompts/generateLesson.ts` — accept `selfAssessment` parameter
- `app/routes/api/ai.generate-lesson.ts` — pass to prompt

**Adaptation logic:**
- 0-25%: full lesson
- 26-60%: skip basics, focus misconceptions
- 61-90%: refresher format (bullets, gotchas)
- 91-100%: jump to quiz option

### B4: "I'm Stuck" Button

**New file:**
- `app/lib/ai/prompts/imStuck.ts` — rewrite prompt based on stuck reason

**Files modified:**
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — floating button + 2-step flow
- `app/routes/api/ai.refine-block.ts` — accept `stuck_reason` parameter

**Stuck reasons:** Too fast, New concept, Bad analogy, Missing prerequisite, Other

---

## Phase 4 — Feedback Loops

**Features:** B2 (Confidence), C1 (Focus Mode)

### B2: Confidence Tracking

**Schema (migration 010):**
```sql
ALTER TABLE review_schedule ADD COLUMN confidence text
  CHECK (confidence IN ('sure', 'maybe', 'guessed'));
```

**Files modified:**
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — 3-button row after recall
- `app/routes/api/review-schedule.ts` — adjust intervals based on confidence
- `app/routes/learning.progress.tsx` — show avg confidence per course

**Interval adjustment:**
- `sure` → standard interval
- `maybe` → interval × 0.7
- `guessed` → reset to 1 day

### C1: Focus Mode / Pomodoro

**Files modified:**
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — focus mode toggle + timer
- `app/routes/learning.progress.tsx` — deep work stats

**Settings keys:** `pomodoro_work_minutes` (25), `pomodoro_break_minutes` (5)

**Implementation:**
- `F` key toggles focus mode (hides sidebar, chat, nav)
- 25-min timer in corner ring
- Bell + toast at end: "Break time, 5 min"
- 4 pomodoros → 15-min break
- Track `deep_work_minutes` per day in localStorage

---

## Phase 5 — Cross-Course Intelligence

**Features:** A2 (Cross-Course Linking)

**Files modified:**
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — render `[[...]]` links
- `app/lib/ai/prompts/generateLesson.ts` — instruct AI to suggest cross-links
- New: `app/lib/ai/prompts/suggestCrossLinks.ts`

**Implementation:**
- `[[Course Slug/Lesson N]]` rendered as clickable links
- Post-generation: AI suggests 1-3 cross-links based on user's library
- Suggestions as chips on sidebar, accept to insert
- Broken links → dimmed italic with tooltip

---

## Phase 6 — Reflection & Mastery

**Features:** D1 (Journal), D2 (Teach It Back)

### D1: Learning Journal

**Schema (migration 011):**
```sql
CREATE TABLE lesson_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'reflection' CHECK (kind IN ('reflection', 'teach_back')),
  content text NOT NULL,
  ai_feedback jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON lesson_journal(lesson_id);
```

**New files:**
- `app/routes/api/journal.ts` — CRUD
- `app/routes/learning.journal.tsx` — monthly digest view
- `app/lib/ai/prompts/journalDigest.ts` — weekly/monthly summary prompt

### D2: Teach It Back

**Files modified:**
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — Teach It Back button + flow
- New: `app/lib/ai/prompts/teachItBack.ts` — analysis prompt

**Audience options:** Junior dev, Curious kid, Your cat, General
**Feedback sections:** Understood deeply, Accurate but parroted, Gaps, Inaccuracies

---

## Phase 7 — Power Features

**Features:** E1 (AI Comparison Mode)

**Files modified:**
- `app/routes/learning.courses.$slug.lessons.$lesson.tsx` — side-by-side UI
- `app/routes/api/ai.generate-lesson.ts` — support parallel generation

**Implementation:**
- Toggle "Compare mode" on model picker
- Two models generate in parallel (two streaming iframes)
- "Pick A" / "Pick B" / "Merge" buttons after completion
- Cost estimate shown before starting (2× normal)
- Usage log with `compare_session_id`

---

## Risks

1. **Lesson viewer file size:** Already 2700+ lines. Phases 3-7 add more. Consider splitting into sub-components.
2. **AI cost:** Compare mode (E1) doubles costs. Daily cap needed.
3. **Mermaid in PDF export:** Need server-side rendering or SVG capture.
4. **Timer accuracy:** `visibilityState` varies across browsers.

## Open Questions for Napat

1. PDF export — is `window.print()` sufficient or do you need server-generated PDF?
2. Focus mode bell sound — any preference for notification style?
3. Journal monthly digest — should it auto-generate or be manual trigger?
4. Compare mode daily cap — what's the maximum $ you'd spend per day?
5. Should keyboard shortcuts conflict with VS Code keybindings (for dev who uses both)?

---

## Migration Plan

| Migration | Table/Column | Phase |
|-----------|-------------|-------|
| 007 | lesson_progress.time_spent_seconds, last_timer_tick | 1 |
| 008 | course_glossary | 2 |
| 009 | lesson_progress.self_assessment | 3 |
| 010 | review_schedule.confidence | 4 |
| 011 | lesson_journal | 6 |
