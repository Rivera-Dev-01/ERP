# ERP V0 — Accounting Prototype

Single-company accounting prototype: journal entries, posting, reversal, and the five core financial reports, built with Next.js + Supabase. See `docs/superpowers/specs/2026-08-19-erp-v0-design.md` for the full specification.

## Prerequisites

- Node.js >= 20
- A hosted Supabase project (free tier is fine)
- Git

## Local setup

```bash
npm install
cp .env.example .env        # then fill in your hosted project's URL and keys
```

Get the values from your Supabase project dashboard (Settings → API) or via the CLI:

```bash
npx supabase login
npx supabase projects api-keys --project-ref <project-ref>
```

Apply the schema migrations to your hosted project:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Apply the seed data once from the dashboard: open `supabase/seed.sql`, paste it into the SQL Editor, and run it (it is idempotent — re-running is safe).

Run the app:

```bash
npm run dev
```

Sign in with the seeded accountant:

- Email: `accountant@v0.local`
- Password: `demo-pass-123`

## Database commands

```bash
npx supabase db push                    # apply pending migrations to the linked project
npx supabase gen types typescript --linked   # regenerate src/types/database.ts (redirect stdout)
```

`supabase db reset` is only available for the local stack; on hosted, schema changes ship as new migrations.

## Tests

```bash
npm test                               # unit + integration (RLS tests need .env.test)
npm run test:e2e                       # Playwright (needs a production build: npm run build first)
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

For managed hosting, connect the repository to your provider and set the environment variables from your hosted Supabase project.

## Security notes

- The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only. It must never be exposed to the browser — do not prefix it with `NEXT_PUBLIC_`.
- All organization-owned tables are protected by PostgreSQL Row-Level Security; the application additionally checks organization membership on every request.
- Secrets are never committed. Only `.env.example` and `.env.test.example` are tracked.

## What’s in Phase 2

- **Organization profile** at `/settings` — edit `name` + `legal_name`, other fields read-only.
- **Fiscal periods** at `/settings/periods` — list, create OPEN period, close with confirmation; overlap blocked by DB constraint.
- **Chart of Accounts** at `/accounts` — TanStack table (Code · Name · Type · Normal Balance · Active), validated create/edit, deactivation with “N journal lines use this” warning, and **atomic CSV import** with row-level error panel (`templates/chart-of-accounts.csv` is the template). The 6 canonical accounts are seeded automatically on first visit to `/accounts`.

Import is CSV-only and atomic: any invalid row aborts the whole file and no rows or `import_batch` are created.

## Known limitations (Phase 2)

- Journal entries, posting/reversal, and financial reports are not yet implemented (Phases 3–4).
- Single visible organization (schema is multi-org ready via `organization_id` + RLS).
