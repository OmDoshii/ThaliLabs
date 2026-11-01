import type { APIRoute } from 'astro';
import { getEnv, runInBackground } from '../../lib/env.ts';
import { createJob, checkLimits } from '../../lib/jobs.ts';
import { processJob } from '../../lib/pipeline.ts';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = getEnv(locals);
  let query = '';
  try { query = String((await request.json()).query ?? '').trim(); } catch {}
  query = query.replace(/\s+/g, ' ').slice(0, 80);
  if (query.length < 3) return json({ message: 'Type at least 3 characters.' }, 400);

  const ip = request.headers.get('cf-connecting-ip') ?? clientAddress ?? 'unknown';
  try {
    const limit = await checkLimits(env, ip);
    if (!limit.ok) return json({ message: limit.message }, 429);

    const job = await createJob(env, query, ip);
    runInBackground(locals, processJob(env, job.id, query));
    return json({ id: job.id });
  } catch (e: any) {
    // Full detail goes to the server log (terminal in dev, `wrangler tail` in production).
    console.error('[fetch] could not start lookup:', e?.message ?? e);
    return json({ message: 'Lookup is unavailable right now. The site owner has been notified in the server log.' }, 503);
  }
};
