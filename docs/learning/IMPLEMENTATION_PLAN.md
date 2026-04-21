# Learning Platform — Implementation Plan

## Design Summary

> Design fetched from Claude Design bundle (April 2026). Five hero screens: Command Center (2 variants), Lesson Reader (2 variants — chat right vs bottom), Quiz (MCQ/code/short-answer flow + result), Library (grid with monogram covers), Design System page. Dark canonical (`#0a0a0a`), light mode warm paper (`#F5F3EF`). Playfair Display serif for display, Inter sans for body, JetBrains Mono for code/labels. Signature red dot (`#cc0000`) used as sacred punctuation — "it punctuates, it does not decorate." Tracked-caps labels (10px, 0.25em). 1px dividers at `rgba(255,255,255,0.06)`. Film-grain overlay. Literary microcopy tone ("composing your lesson…", "something went sideways.", "the oracle is silent.").

---

## Inherited Tokens & Patterns from the Repo

### Fonts (loaded via Google Fonts in `root.tsx`)
| Token | Family | Role |
|---|---|---|
| `--font-serif` | Playfair Display 400–900 | Display headings, hero text |
| `--font-sans` | Inter 100–900 | Body, tracked-caps labels (`mono-accent` class uses JetBrains Mono, but labels use Inter-based uppercase) |
| `--font-mono` | JetBrains Mono 400–500 | Code blocks, technical labels (`.mono-accent`) |

### Colors (hardcoded in `app.css`, not yet @theme tokens)
| Value | Usage |
|---|---|
| `#0a0a0a` | Background |
| `#e5e5e5` | Default text |
| `#ffffff` at various opacities | Headings, labels, dividers |
| `#cc0000` | `.film-dot` red accent |
| `rgba(255,255,255,0.04–0.15)` | Borders, hover states, scrollbar |

### Existing CSS utilities (in `app.css`)
`film-grain`, `vignette`, `animate-fade-in`, `animate-delay-*`, `hr-ornament`, `link-reveal`, `card-lift`, `stagger-children`, `bw-border`, `marquee-track`, `pulse-subtle`, `mono-accent`, `film-dot`, `film-frame`, `sprocket-strip`, `film-cell`, `film-cell-grain`, `contact-sheet`

### Routing conventions
- **React Router 7 Framework mode** with file-based routes configured in `app/routes.ts` (not filesystem convention — explicit `route()` calls).
- Pattern: `index("routes/home.tsx")`, `route("vault", "routes/vault.tsx")`.
- Learning routes will follow the same pattern: explicit entries in `routes.ts`.

### Existing infrastructure
- **Supabase client:** `app/lib/supabase.ts` — browser-side client using `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. Learning platform will add a **server-side** service-role client in `app/lib/supabase.server.ts`.
- **PBKDF2 via Web Crypto:** Already used in `app/lib/vault-crypto.ts` (600k iterations, SHA-256). The learning auth module will use the same approach.
- **Workers entry:** `workers/app.ts` exposes `cloudflare.env` via `AppLoadContext`. Learning routes access secrets through `context.cloudflare.env`.
- **Wrangler:** `wrangler.json` with `compatibility_date: "2025-10-08"`, `nodejs_compat` flag.
- **No KV binding yet** — will need to add one for rate limiting.
- **No tailwind.config file** — Tailwind 4 uses `@theme` in `app.css` directly.
- **TypeScript strict mode** already enabled.
- **No test framework installed yet** (no vitest, no playwright in devDeps).

---

## Gaps & Questions for Napat

1. **Design file is 404.** Please re-share or drop the file into the repo. Without it I'll match the textual description but can't pixel-match.

2. **KV namespace for rate limiting.** The spec calls for Workers KV to rate-limit login attempts. I'll add a KV binding (`RATE_LIMIT_KV`) in `wrangler.json`. You'll need to create the namespace via `wrangler kv namespace create RATE_LIMIT_KV`. OK?

3. **Supabase project.** Is this the same Supabase project used for the vault, or a separate one? The learning platform uses the service role key (server-only), which is a different access pattern from the vault's browser-side anon key. I'll assume same project, separate tables.

4. **Font loading for learning pages.** The current Google Fonts link already loads Inter, Playfair Display, and JetBrains Mono — all we need. No changes required.

5. **Test framework.** The spec calls for Vitest + Playwright. Neither is installed. I'll add them as devDependencies in Phase 1. OK?

6. **`docs/migrations/` vs `docs/learning/migrations/`.** The spec says `docs/migrations/001_learning_init.sql`. I'll use that path. Confirm this is the desired location (it's outside the `learning/` doc folder).

---

## Phase 1 — Foundation & Auth Gate: Planned Commits

### Commit 1: Add dependencies
- `zod` (validation)
- `vitest` + `@cloudflare/vitest-pool-workers` (testing, devDep)
- No new runtime deps beyond zod — everything else is stdlib or already installed.

### Commit 2: Add KV binding + env var declarations
- Update `wrangler.json` with `RATE_LIMIT_KV` binding and learning-related `[vars]`.
- Create `.dev.vars.example` listing all required secrets.
- Update `worker-configuration.d.ts` / run `cf-typegen` to pick up new bindings.

### Commit 3: Database migration
- Create `docs/migrations/001_learning_init.sql` with the full schema from the spec.

### Commit 4: Session library (`app/lib/session.server.ts`)
- PBKDF2-SHA-256 verify (600k iterations).
- HMAC-SHA-256 cookie sign/verify.
- Constant-time compare.
- Cookie create/parse/clear helpers.
- Unit tests.

### Commit 5: Supabase server client (`app/lib/supabase.server.ts`)
- Factory using service role key from `context.cloudflare.env`.

### Commit 6: Auth gate route + session API
- `app/routes/learning.gate.tsx` — master password screen (dark, minimal, matching site aesthetic).
- `app/routes/learning.tsx` — layout wrapper with auth middleware (checks cookie, redirects to gate).
- `app/routes/learning._index.tsx` — placeholder command center ("authenticated" confirmation).
- Wire routes into `app/routes.ts`.
- `POST /learning/api/session` — verify password, rate limit via KV, set cookie.
- `DELETE /learning/api/session` — clear cookie.

### Commit 7: Master password setup script
- `scripts/set-master-password.ts` — reads password from stdin, derives PBKDF2 hash, prints `MASTER_PASSWORD_HASH` string.

### Commit 8: Documentation
- `docs/learning/RUNBOOK.md` — setup steps (Supabase project, run migration, set secrets, deploy).
- `docs/learning/DESIGN_BRIEF.md` — copy of the original design prompt for reference.

---

## Risks

| Risk | Mitigation |
|---|---|
| Design file unavailable — can't pixel-match | Proceed with textual spec; adjust when design is provided |
| KV cold-start latency on rate-limit reads | KV reads are fast (<10ms); acceptable for auth |
| No existing test infra — adding vitest/playwright adds weight | Keep test deps in devDependencies only; don't over-test in Phase 1 |
| `__Host-` cookie prefix requires `Secure` flag — won't work on `localhost` HTTP | Use `__Host-` in production only; fall back to `__Secure-` or plain name in dev mode |
| Large prompt spec — easy to drift | Keep this plan as living doc; update after each phase |

---

## Ready for Approval

Napat — review the above plan and the 8 planned commits for Phase 1. Once you approve, I'll begin implementation. Please also:
1. Share the design file (or confirm I should proceed without it).
2. Confirm the KV namespace and test framework additions are OK.
3. Confirm migration file location (`docs/migrations/`).
