/** Admin auth: password -> HMAC-signed, HttpOnly session cookie. Web Crypto only (runs on Workers). */
import { adminClient } from './db.ts';
import type { ServerEnv } from './env.ts';

export const COOKIE = 'tl_admin';
const TTL_MS = 8 * 3600_000;
const enc = new TextEncoder();

const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

/** Constant-time string compare (hash both so lengths do not leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hmac('cmp', a), hmac('cmp', b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

export const adminConfigured = (env: ServerEnv) =>
  Boolean(env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12 && env.ADMIN_SESSION_SECRET && env.ADMIN_SESSION_SECRET.length >= 24);

export async function makeSession(env: ServerEnv): Promise<string> {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${await hmac(env.ADMIN_SESSION_SECRET!, exp)}`;
}

export async function verifySession(env: ServerEnv, token: string | undefined): Promise<boolean> {
  if (!token || !adminConfigured(env)) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(env.ADMIN_SESSION_SECRET!, exp));
}

// ---- login attempt limiter: 5 failures / 15 min / IP
const memAttempts: { ip: string; at: number }[] = [];
const WINDOW = 15 * 60_000;
const MAX = 5;

export async function tooManyAttempts(env: ServerEnv, ip: string): Promise<boolean> {
  const db = adminClient(env);
  if (!db) return memAttempts.filter((a) => a.ip === ip && a.at > Date.now() - WINDOW).length >= MAX;
  const { count } = await db.from('admin_attempts').select('id', { count: 'exact', head: true })
    .eq('ip', ip).gte('at', new Date(Date.now() - WINDOW).toISOString());
  return (count ?? 0) >= MAX;
}

export async function recordFailure(env: ServerEnv, ip: string) {
  const db = adminClient(env);
  if (!db) { memAttempts.push({ ip, at: Date.now() }); return; }
  await db.from('admin_attempts').insert({ ip });
}
