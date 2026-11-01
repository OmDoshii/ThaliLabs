# Thali Labs: brand-wise Indian calorie counter

Astro + React islands, Supabase (Postgres, pg_trgm), Cloudflare Workers.

## Run locally
    npm install
    cp .dev.vars.example .dev.vars
    printf 'ADMIN_PASSWORD=<12+ chars>\nADMIN_SESSION_SECRET=<24+ random chars>\n' > .dev.vars
    npm run dev               # http://localhost:4321
    npm test                  # calculation + validation unit tests

## Go live
1. Create a Supabase project. Run `supabase/migrations/001_init.sql`, then `supabase/seed.sql` in the SQL editor.
2. Set secrets: `wrangler secret put SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, and optionally `SERPER_API_KEY`, `GEMINI_API_KEY`.
3. `SITE_URL=https://yourdomain npm run build && npx wrangler deploy`

## Before launch
- Dev-only sample brands (src/data/seed.ts DEV_SAMPLES) are placeholders, not real label data. They are never written to seed.sql.
- Generic values are approximate. Check each against IFCT 2017, then mark verified in /admin.
- The live lookup (Open Food Facts, Serper, Gemini) has not been tested against the real services. Test it with real keys.
