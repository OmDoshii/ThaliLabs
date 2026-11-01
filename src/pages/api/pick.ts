import type { APIRoute } from 'astro';
import { bumpSearchCount } from '../../lib/db.ts';

export const prerender = false;

// Called when a user picks a suggestion. Feeds the popularity ordering.
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { id } = await request.json();
    if (typeof id === 'string' && id.length < 64) await bumpSearchCount(locals, id);
  } catch {}
  return new Response(null, { status: 204 });
};
