/**
 * Server-side env access. On Cloudflare (and in `astro dev`, which runs on workerd)
 * secrets come from the `cloudflare:workers` env binding. Secrets are only ever read
 * on the server and never sent to the browser.
 *
 * Local dev: put values in `.dev.vars` (gitignored) or `.env`.
 */
import { env as cfEnv } from 'cloudflare:workers';

export interface ServerEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
  SERPER_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  DAILY_FETCH_CAP?: string;
}

const KEYS: (keyof ServerEnv)[] = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET',
  'SERPER_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'DAILY_FETCH_CAP',
];

// `locals` is accepted for call-site compatibility but is not used.
export function getEnv(_locals?: unknown): ServerEnv {
  const out: ServerEnv = {};
  const cf = (cfEnv ?? {}) as Record<string, string | undefined>;
  const meta = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
  for (const k of KEYS) out[k] = cf[k] ?? meta[k];
  return out;
}

export const hasSupabase = (e: ServerEnv) => Boolean(e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY);

/** Run work after the response is sent (Cloudflare). Falls back to fire-and-forget. */
export function runInBackground(locals: any, work: Promise<unknown>) {
  let ctx: any;
  try { ctx = locals?.cfContext; } catch {}
  if (ctx?.waitUntil) ctx.waitUntil(work); else void work.catch(() => {});
}
