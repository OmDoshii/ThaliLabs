/**
 * Detects the most common Supabase setup mistake: using the publishable / anon key
 * where the server needs the secret (service role) key. The anon key is bound by
 * row-level security, so every server write is rejected.
 */
export function keyProblem(key: string | undefined): string | null {
  if (!key) return null;
  if (key.startsWith('sb_publishable_')) return 'SUPABASE_SERVICE_ROLE_KEY is the PUBLISHABLE key. Use the SECRET key (starts with sb_secret_) from Supabase, Project Settings, API Keys.';
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role && payload.role !== 'service_role') return `SUPABASE_SERVICE_ROLE_KEY has role "${payload.role}". Use the service_role (secret) key.`;
    } catch {}
  }
  return null;
}
