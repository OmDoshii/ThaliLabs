import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env.ts';
import { getJob } from '../../lib/jobs.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const id = url.searchParams.get('id') ?? '';
  const job = id.length < 64 ? await getJob(getEnv(locals), id) : null;
  const body = job
    ? { status: job.status, food: job.food ?? null, unsaved: job.unsaved ?? false, message: job.message }
    : { status: 'failed', message: 'Lookup not found. Please try again.' };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
