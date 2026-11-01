import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env.ts';
import { COOKIE, adminConfigured, makeSession, recordFailure, safeEqual, tooManyAttempts } from '../../../lib/auth.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, redirect, clientAddress }) => {
  const env = getEnv(locals);
  const ip = request.headers.get('cf-connecting-ip') ?? clientAddress ?? 'unknown';

  // CSRF: the form must come from our own origin
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return new Response('Bad origin', { status: 403 });

  if (!adminConfigured(env)) return redirect('/admin/login?e=config');
  if (await tooManyAttempts(env, ip)) return redirect('/admin/login?e=locked');

  const form = await request.formData();
  const pw = String(form.get('password') ?? '');
  if (!(await safeEqual(pw, env.ADMIN_PASSWORD!))) {
    await recordFailure(env, ip);
    return redirect('/admin/login?e=bad');
  }
  cookies.set(COOKIE, await makeSession(env), {
    httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'strict', path: '/', maxAge: 8 * 3600,
  });
  return redirect('/admin');
};
