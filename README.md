# napats-site

Personal portfolio + AI-powered learning platform by [Napat Sangsong](https://napats.dev) — built with React Router 7, deployed on Cloudflare Workers.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Router 7 (SSR) |
| Runtime | Cloudflare Workers (Edge) |
| Database | Supabase PostgreSQL |
| AI | Anthropic Claude API (Opus / Sonnet / Haiku) |
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

Create `.dev.vars` with:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
ANTHROPIC_API_KEY=sk-ant-...
SESSION_HMAC_SECRET=random-32-char-string
```

### Database Setup

Run migrations in order against your Supabase project:

```
docs/migrations/001_learning_init.sql
docs/migrations/002_seed_placeholder_courses.sql
docs/migrations/003_spaced_repetition.sql
docs/migrations/004_recall_checkpoint.sql
docs/migrations/005_knowledge_graph.sql
```

### Deploy

```bash
pnpm run deploy
```

## Project Structure

```
app/
  routes/
    home.tsx                          # Portfolio landing page
    learning._index.tsx               # Learning command center
    learning.courses.$slug.tsx        # Course overview
    learning.courses.$slug.lessons.$lesson.tsx  # Lesson viewer
    learning.graph.tsx                # Knowledge graph visualization
    learning.progress.tsx             # Progress dashboard
    learning.settings.tsx             # User preferences
    learning.library.tsx              # Course library
    learning.gate.tsx                 # Auth gate
  routes/api/                         # 17 API endpoints
    ai.plan-course.ts                 # Course planning (SSE)
    ai.generate-lesson.ts             # Lesson generation (SSE)
    ai.perspective-lesson.ts          # Perspective switching (SSE)
    ai.deep-dive.ts                   # Hyper-node sub-lessons (SSE)
    ai.chat.ts                        # Tutor chat + Socratic recall
    ai.generate-quiz.ts               # Quiz generation
    ai.grade.ts                       # AI grading
    ai.suggest-courses.ts             # Personalized suggestions
    ai.related-courses.ts             # Post-completion suggestions
    ai.build-graph.ts                 # Knowledge graph extraction
    ai.refine-block.ts                # Block editing
    courses.ts                        # Course CRUD
    settings.ts                       # User preferences
    progress.$lessonId.ts             # Progress tracking
    review-schedule.ts                # Spaced repetition
    graph.ts                          # Graph data
    session.ts                        # Authentication
  lib/ai/
    client.ts                         # Anthropic API client (fetch-based)
    router.ts                         # Auto model selection (11 actions)
    helpers.server.ts                 # SSE, auth, slug utilities
    schemas.ts                        # Zod validation (7 body schemas)
    prompts/                          # 13 AI system prompts
  components/learning/                # 8 UI components
    BlockRenderer.tsx                 # 9 block types + hyper-node support
    ChatPanel.tsx                     # AI tutor chat
    TopBar.tsx                        # Navigation bar
    primitives.tsx                    # Design system primitives
  styles/learning.css                 # Animations
docs/
  migrations/                         # 5 SQL migrations
  learning/                           # Architecture docs
```

## Site Sections

### Portfolio (`/`)
- Hero with animated marquee
- About, Work, Expertise sections
- Personal interests (Music, Literature, Coffee, Thuaifu)
- Contact information

### Learning Platform (`/learning`)

An AI-powered personal learning system with 15+ features:

#### Course Creation
- **Interactive AI Coach** — Multi-turn conversation to design courses
- **Adaptive Difficulty** — Auto-detects level from your language
- **Learning Style Awareness** — Tailors content to reading/visual/hands-on preferences
- **Smart Prerequisites** — References your library, suggests what to learn first
- **Course Templates** — Quick Start: 30-min intro, Weekend deep dive, 30-day challenge, Project-based
- **AI Suggestions** — Personalized "Suggested For You" based on progress

#### Lesson Viewer
- **9 Block Types** — Prose, heading, code, callout, mermaid, katex, image, quote, interactive
- **Mandatory Concept Maps** — Mermaid diagram at the start of every lesson
- **Hyper-Nodes** — Clickable key terms generate inline sub-lessons (3 levels deep)
- **Deep-Dive Breadcrumbs** — Clickable path trail for navigation
- **Minsu AI Tutor** — Chat panel for block-level questions

#### Perspective Switching (5 Lenses)
| Lens | Framework |
|------|-----------|
| Default | Standard educational content |
| Evolutionary Biologist | Natural selection, fitness landscapes, phylogenetic history |
| Neuro-Engineer | Neural circuitry, signal processing, system architecture |
| Philosopher | Phenomenology, qualia, epistemology, thought experiments |
| Software Architect | Design patterns, distributed systems, engineering analogies |

#### Socratic Active Recall
- Feynman Technique checkpoint after each lesson
- Must explain the concept back to AI
- No multiple choice — conversational debate
- Next lesson locked until understanding confirmed

#### Knowledge Graph (`/learning/graph`)
- Force-directed canvas visualization
- AI-detected course relationships
- **Knowledge Entropy** — Nodes fade based on Ebbinghaus forgetting curve
- Glitch effect on overdue nodes

#### Spaced Repetition
- Expanding intervals: 1 → 3 → 7 → 14 → 30 → 60 days
- Review-due alerts on home page and progress dashboard

## AI Model Routing

| Task | Model |
|------|-------|
| Course planning | Opus |
| Lesson generation, quizzes, grading, recall, deep-dive, perspectives | Sonnet |
| Chat (short), suggestions, graph building | Haiku |

## Database Schema

13 tables across 5 migrations:

`sessions` · `courses` · `lessons` · `lesson_blocks` · `lesson_block_history` · `lesson_progress` · `chat_threads` · `chat_messages` · `quizzes` · `quiz_attempts` · `settings` · `review_schedule` · `course_relationships`

## License

Private project. All rights reserved.
