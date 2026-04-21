# Learning Platform — Design Brief

> This is the original design prompt used to generate the Learning Canvas in Claude Design (April 2026).

## Design Source

- **Claude Design project:** `NapatsDev-Learn`
- **Primary file:** `Learning Canvas.html`
- **Component files:** `tokens.jsx`, `primitives.jsx`, `command-center.jsx`, `lesson-reader.jsx`, `quiz.jsx`, `library-and-system.jsx`

## Design Scope

Five hero screens, high polish, with live interactions:

1. **Command Center** (2 variants: centered hero + editorial spread)
2. **Lesson Reader** (2 variants: chat on right + chat docked below)
3. **Quiz** (MCQ, code challenge, short-answer with AI grading, result screen)
4. **Library** (grid with typographic monogram covers)
5. **Design System** (tokens, type, components, voice)

## Design Tokens (from `tokens.jsx`)

### Dark (canonical)
- bg: `#0a0a0a`
- bgElevated: `#0f0f0f`
- bgCard: `rgba(255,255,255,0.02)`
- ink: `#e5e5e5`
- inkStrong: `#ffffff`
- inkMuted: `rgba(255,255,255,0.5)`
- inkGhost: `rgba(255,255,255,0.20)`
- inkFaint: `rgba(255,255,255,0.10)`
- divider: `rgba(255,255,255,0.06)`
- dividerStrong: `rgba(255,255,255,0.12)`
- accent: `#cc0000`
- accentSoft: `#7A1F26`

### Light
- bg: `#F5F3EF`
- bgElevated: `#EEEBE4`
- bgCard: `rgba(10,9,8,0.03)`
- ink: `#0A0908`
- inkStrong: `#000000`
- inkMuted: `rgba(10,9,8,0.55)`
- inkGhost: `rgba(10,9,8,0.20)`
- inkFaint: `rgba(10,9,8,0.10)`
- divider: `rgba(10,9,8,0.10)`
- dividerStrong: `rgba(10,9,8,0.18)`
- accent: `#cc0000`
- accentSoft: `#E63946`

## Type Scale
- Display serif: Playfair Display, 88px (hero), 52px (lesson title), 30px (h2), 22px (h3)
- Body: Inter, 16px, weight 300, line-height 1.75
- Tracked caps: JetBrains Mono, 9–10px, uppercase, letter-spacing 0.2–0.3em
- Code: JetBrains Mono, 13px, line-height 1.7

## Sacred Elements
- **Red dot** (`#cc0000`, 5–6px circle): "it punctuates, it does not decorate"
- **Film-dot breathe**: 4s ease-in-out infinite opacity animation (1 → 0.55 → 1)
- **Ghost serif**: display serif at very low opacity (inkGhost) for subtitle/taglines
- **Tracked caps labels**: all-caps mono with generous letter-spacing for section labels
- **1px rules**: horizontal dividers using thin borders at divider opacity
- **Hr ornament**: centered gradient lines with film-dot between them

## Voice & Microcopy
- Literary, editorial, lowercase welcome
- "composing your lesson…" (not "Loading…")
- "something went sideways." (not "Error")
- "well done. the next lesson is ready." (not "Quiz passed!")
- "your library is empty. ask for your first course below." (not "Empty")
- "you've drifted offline. reconnect to continue." (not "Offline")

## Chat Persona
- Name: **Minsu**
- Tone: quiet, literary, measured editorial paragraphs
- No bullet points, no emoji, no "as an AI"
- Lowercase welcome, short sentences
