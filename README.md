# napats-site

Personal portfolio + AI-powered learning platform by [Napat Sangsong](https://napats.dev) — built with React Router 7, deployed on Cloudflare Workers.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Router 7 (SSR) |
| Runtime | Cloudflare Workers (Edge) |
| Database | Supabase PostgreSQL |
| AI | OpenRouter (Gemini Flash/Pro + free models) with Claude fallback |
| Styling | Tailwind CSS 4 + Inline Styles |
| Language | TypeScript 5.9 |
| Build | Vite 6 |

## Getting Started

```bash
pnpm install
cp .dev.vars.example .dev.vars  # Add your API keys
pnpm dev                        # http://localhost:5173
```

### Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-v1-...
SESSION_HMAC_SECRET=random-32-char-string
```

### Database Setup

Run migrations in order:

```
docs/migrations/001_learning_init.sql
docs/migrations/002_seed_placeholder_courses.sql
docs/migrations/003_spaced_repetition.sql
docs/migrations/004_recall_checkpoint.sql
docs/migrations/005_knowledge_graph.sql
docs/migrations/006_lesson_notes.sql
```

### Deploy

```bash
pnpm run deploy
```

## Learning Platform — 34 Features

### Course Creation
- **Interactive AI Coach** — multi-turn chat with warm learning coach persona
- **Adaptive Difficulty** — auto-detects level from your language
- **Learning Style Awareness** — tailors to reading/visual/hands-on preferences
- **Smart Prerequisites** — checks your library, suggests what you need first
- **8 Course Templates** — Quick intro, Deep dive, 30-day challenge, Project-based, ELI5, Interview prep, Cheat sheet, Compare & contrast
- **Visual Preview Card** — beautiful card with lessons, difficulty, time estimate
- **AI Suggestions** — "Suggested For You" based on progress
- **Progress Bar** — live stage labels + animated bar during AI generation

### Lesson Viewer
- **9 Block Types** — prose, heading, code, callout, mermaid, katex, image, quote, interactive
- **Markdown Tables** — pipe-delimited tables render as HTML
- **Mermaid Diagrams** — rendered via CDN in themed iframe
- **KaTeX Math** — LaTeX rendered via KaTeX CDN
- **Interactive Blocks** — sandboxed iframe with HTML wrapper
- **Mandatory Concept Maps** — Mermaid diagram at lesson start

### Perspective Switching (5 Lenses)
- Default, Evolutionary Biologist, Neuro-Engineer, Philosopher, Software Architect

### Hyper-Nodes (Recursive Deep-Dive)
- Click `<hyper>` terms for inline sub-lessons (3 levels deep)
- Breadcrumb navigation for drill-down path

### Personal Notes
- Add colored sticky notes on any block
- 5 color options, inline editor, persisted to database
- Edit and delete on hover

### Highlight-to-Translate
- Select any text → floating tooltip with translate button
- Auto-detects Thai/English → translates to the other
- Full page TH/EN toggle in lesson header

### Socratic Active Recall
- Feynman Technique checkpoint after each lesson
- Conversational debate — no multiple choice
- AI confirms understanding before unlocking next lesson
- Retry + Skip buttons if stuck

### Course Editing
- Edit course title, subtitle, description inline
- Regenerate, delete, or add individual lessons
- Delete entire course with confirmation

### Completion Certificate
- Shows when all lessons are 100% complete
- Printable certificate with course title, date, lesson count
- DOWNLOAD button opens print dialog

### Knowledge Graph (`/learning/graph`)
- Force-directed canvas visualization
- AI-detected course relationships
- Knowledge Entropy — nodes fade based on Ebbinghaus forgetting curve

### Spaced Repetition
- Expanding intervals: 1 → 3 → 7 → 14 → 30 → 60 days
- Review-due alerts on home + progress dashboard

### Progress Dashboard
- Overall stats: courses, lessons completed, time learned
- Active courses with progress bars
- Spaced repetition schedule

### AI Provider Architecture
- **Primary:** OpenRouter (Gemini 2.5 Flash/Pro + free Gemma models)
- **Fallback:** Claude Haiku (when all OpenRouter models are cooling down)
- **Rate-limit rotation:** auto-rotates across 5 free models with KV cooldown tracking

### 20 API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `ai/plan-course` | Course planning (SSE) |
| `ai/generate-lesson` | Lesson generation (SSE) |
| `ai/perspective-lesson` | Perspective switching (SSE) |
| `ai/deep-dive` | Hyper-node sub-lessons (SSE) |
| `ai/chat` | Tutor chat + Socratic recall |
| `ai/chat-history` | Load chat thread history |
| `ai/generate-quiz` | Quiz generation |
| `ai/grade` | AI grading |
| `ai/suggest-courses` | Personalized recommendations |
| `ai/related-courses` | Post-completion suggestions |
| `ai/build-graph` | Knowledge graph extraction |
| `ai/refine-block` | Block editing |
| `ai/translate` | Text + block translation |
| `courses` | Course CRUD + lesson management |
| `settings` | User preferences |
| `notes` | Personal notes CRUD |
| `progress/:lessonId` | Progress + recall status |
| `review-schedule` | Spaced repetition |
| `graph` | Knowledge graph data |
| `session` | Authentication |

### Database (14 Tables)

`sessions` · `courses` · `lessons` · `lesson_blocks` · `lesson_block_history` · `lesson_progress` · `lesson_notes` · `chat_threads` · `chat_messages` · `quizzes` · `quiz_attempts` · `settings` · `review_schedule` · `course_relationships`

## License

Private project. All rights reserved.
