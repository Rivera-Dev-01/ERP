# ERP V0 — Accounting Prototype

Single-company accounting prototype: journal entries, posting, reversal, and the five core financial reports, built with Next.js + Supabase. See `docs/superpowers/specs/2026-08-19-erp-v0-design.md` for the full specification.

## Prerequisites

- Node.js >= 20
- Docker Desktop (for the local Supabase stack)
- Git

## Local setup

```bash
npm install
npx supabase start          # starts local Postgres + Auth (first run downloads images)
npx supabase db reset       # applies migrations and seed data
```

Copy the keys printed by `supabase start` into `.env` (template: `.env.example`):

```bash
cp .env.example .env
```

Run the app:

```bash
npm run dev
```

Sign in with the seeded accountant:

- Email: `accountant@v0.local`
- Password: `demo-pass-123`

## Database commands

```bash
npx supabase db reset                  # re-apply all migrations + seed
npx supabase gen types typescript --local --output src/types/database.ts
npx supabase stop                      # stop the local stack
```

## Tests

```bash
npm test                               # unit + integration (RLS tests need the local stack + .env.test)
npm run test:e2e                       # Playwright (needs local stack + seed, and npm run dev or the built app)
```

Copy `.env.test.example` to `.env.test` and fill in the Supabase keys for the RLS integration tests.

## Lint, types, and build

```bash
npm run lint
npm run typecheck
npm run build
```

## Deployment

The app is a standard Next.js standalone build; a `Dockerfile` is included:

```bash
docker build -t erp-v0 .
docker run -p 3000:3000 -e NEXT_PUBLIC_SUPABASE_URL=... -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... erp-v0
```

For managed hosting, connect the repository to your provider and set the environment variables from a hosted Supabase project (apply migrations with `supabase db push` after linking with `supabase link`).

## Security notes

- The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only. It must never be exposed to the browser — do not prefix it with `NEXT_PUBLIC_`.
- All organization-owned tables are protected by PostgreSQL Row-Level Security; the application additionally checks organization membership on every request.
- Secrets are never committed. Only `.env.example` and `.env.test.example` are tracked.

## Known limitations (Phase 1)

- Local Supabase stack only; no hosted deployment yet.
- Accounts, journal entries, imports, and reports are not yet implemented (Phases 2–5).
- Single visible organization (schema is multi-org ready via `organization_id` + RLS).
