# Learning Platform — Runbook

## Prerequisites

- Node.js 20+ with pnpm
- A Supabase project (can reuse the existing one for napats-site)
- A Cloudflare Workers account with the napats-site worker deployed
- An Anthropic API key (for AI features, Phase 3+)

## Initial Setup

### 1. Run the database migration

Open the Supabase SQL Editor and run the contents of:
```
docs/migrations/001_learning_init.sql
```

### 2. Create a Workers KV namespace for rate limiting

```bash
wrangler kv namespace create RATE_LIMIT_KV
```

Copy the printed `id` value and paste it into `wrangler.json` under `kv_namespaces[0].id`.

### 3. Generate a master password hash

```bash
echo "your-password-here" | npx tsx scripts/set-master-password.ts
```

### 4. Generate a session HMAC secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5. Set local dev vars

Copy `.dev.vars.example` to `.dev.vars` and fill in:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
MASTER_PASSWORD_HASH=<output from step 3>
SESSION_HMAC_SECRET=<output from step 4>
ANTHROPIC_API_KEY=sk-ant-...  # (not needed until Phase 3)
```

### 6. Set production secrets

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put MASTER_PASSWORD_HASH
wrangler secret put SESSION_HMAC_SECRET
wrangler secret put ANTHROPIC_API_KEY
```

### 7. Regenerate types

```bash
pnpm cf-typegen
```

### 8. Run locally

```bash
pnpm dev
```

Visit `http://localhost:5173/learning` — you should see the master password gate.

## Rotating the master password

```bash
echo "new-password" | npx tsx scripts/set-master-password.ts
# Then update .dev.vars locally and:
wrangler secret put MASTER_PASSWORD_HASH
```

## Emergency session revocation

Rotate the `SESSION_HMAC_SECRET` — this invalidates ALL active sessions:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
wrangler secret put SESSION_HMAC_SECRET
```

## Per-device session revocation

In the Supabase SQL editor:

```sql
UPDATE sessions SET revoked_at = now() WHERE dev_id = 'device-id-here';
```

Or revoke all:

```sql
UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL;
```
