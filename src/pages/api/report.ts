import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env.ts';
import { adminClient } from '../../lib/db.ts';

export const prerender = false;

// Visitors flag a wrong value. 3 reports auto-flag the entry for admin review.
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { id } = await request.json();
    const db = adminClient(getEnv(locals));
    if (db && typeof id === 'string' && id.length < 64) {
      const { data } = await db.from('foods').select('report_count').eq('id', id).maybeSingle();
      if (data) {
        const c = (data.report_count ?? 0) + 1;
        await db.from('foods').update({ report_count: c, ...(c >= 3 ? { status: 'flagged' } : {}) }).eq('id', id);
      }
    }
  } catch {}
  return new Response(null, { status: 204 });
};
