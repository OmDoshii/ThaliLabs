# Thali Labs: setup guide

## Part 1. Run it on your computer

1. Install Node.js 22 or newer from https://nodejs.org (LTS). Check with `node -v`.
2. Unzip the project, open a terminal in the folder, run `npm install`.
3. Quick look with sample data (no accounts needed):
   - Copy `.dev.vars.example` to `.dev.vars`.
   - Set `ADMIN_PASSWORD` (12+ chars) and `ADMIN_SESSION_SECRET` (24+ random chars). Leave the Supabase lines empty.
   - Run `npm run dev` and open http://localhost:4321
   - Sample brands (Amul, Milky Mist, MuscleBlaze...) are placeholders, not real label data. Changes made in /admin reset on restart.
4. Run with your real database: do Part 2 first, then fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars` and restart `npm run dev`.
5. `npm test` runs the calculation and validation tests.

## Part 2. Set up Supabase (database)

1. Open your project at https://supabase.com/dashboard, then SQL Editor, then New query.
2. Paste the whole of `supabase/migrations/001_init.sql` and click Run.
3. New query again. Paste the whole of `supabase/seed.sql` and click Run. This adds about 50 generic Indian foods.
4. Project Settings, then API. Copy the Project URL (looks like https://xxxx.supabase.co) and the secret / service_role key.
   The URL must NOT end in /rest/v1/. The secret key is server only: never put it in browser code or share it.
5. Table Editor: confirm `foods` has rows.

## Part 3. Deploy to Cloudflare

This builds a Cloudflare Worker, so the address will be https://thalilabs.YOUR-ACCOUNT.workers.dev (not pages.dev).

1. Create a free account at https://dash.cloudflare.com
2. In the project folder run `npx wrangler login` and approve in the browser.
3. Add each secret (you are prompted to paste the value; the first command may ask to create the Worker, say yes):

       npx wrangler secret put SUPABASE_URL
       npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
       npx wrangler secret put ADMIN_PASSWORD
       npx wrangler secret put ADMIN_SESSION_SECRET
       npx wrangler secret put GEMINI_API_KEY
       npx wrangler secret put SERPER_API_KEY      (optional)

4. Build and deploy (replace the address with the one wrangler prints; if unsure, deploy once, then rebuild with the right one):

       SITE_URL=https://thalilabs.YOUR-ACCOUNT.workers.dev npm run build
       npx wrangler deploy

   On Windows PowerShell: `$env:SITE_URL="https://..."; npm run build; npx wrangler deploy`
5. Open the printed URL. Test search, add a food to the log, then open /admin and sign in.

## Part 4. Custom domain later

Cloudflare dashboard, Workers & Pages, thalilabs, Settings, Domains & Routes, Add custom domain. Then rebuild with `SITE_URL=https://yourdomain` and redeploy so canonical links and the sitemap use it.

## Before you tell people about it

- Check the generic foods against IFCT 2017, then use /admin to edit and mark verified.
- Test the live lookup by searching a product that is not in the database.
- Rotate any key you have ever pasted into a chat or email.

## How brand products get into the database

1. **Visitors (automatic).** Search "britannia paneer". Under the results is "Not your brand? Look up ... online". It searches Open Food Facts and, if you set SERPER_API_KEY and GEMINI_API_KEY, the brand's own page. Numbers pass automatic checks (calories vs macros, category ranges, name match) before being saved. A product that fails is never shown publicly. It goes to the Review queue in /admin.
2. **You, by hand (most reliable).** /admin, "Add a product". Type the per-100g numbers from the pack, add alternate spellings, save. It is marked verified immediately.
3. **Review queue.** /admin lists lookups that failed checks. Approve after comparing with the pack, or reject.

Tip: add your 30 to 50 most-used brands by hand first. Automatic lookup is best for the long tail. Visitors cannot add products directly, which keeps bad data out.

## When a lookup says "could not find a label"

The reason is always printed in the terminal (local) or in `npx wrangler tail` (live). Look for lines starting with `[lookup]`:

- `Brand-page search skipped` : SERPER_API_KEY or GEMINI_API_KEY is missing.
- `Serper HTTP 4xx` : the Serper key is wrong or out of credits.
- `Gemini (...) HTTP 400/403/404` : the Gemini key is not valid for the Gemini API, or the model name is retired.
  Create a key at aistudio.google.com/apikey. To change model, set GEMINI_MODEL.
- `no nutrition text on the page (probably loaded by JavaScript)` : that site cannot be read. The next result is tried.
- `numbers ... do not appear in the page text` : the AI invented values and they were rejected on purpose.
- `Open Food Facts: N products, 0 with complete nutrition` : that product is not on Open Food Facts with full values.

Visitors who hit "not found" can use "Send us the label values". Those go to Review queue in /admin, marked "Sent by a visitor". Nothing is public until you approve it.
