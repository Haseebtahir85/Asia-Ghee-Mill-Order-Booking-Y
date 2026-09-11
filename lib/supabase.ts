import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side client using the SERVICE ROLE key.
// Only import this from API routes / server components — never
// bundle the service key into client-side code.
//
// Built lazily (on first use, not on import) so that `next build`
// can statically analyze route files even before env vars are set
// in the deployment platform — it only throws once a request
// actually tries to hit the database without them configured.
let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
        "Set them in your deployment platform's project settings (or .env.local for local dev)."
    );
  }

  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cached;
}

// Proxy so existing call sites (`supabaseServer.from(...)`) keep working
// unchanged, while the real client is only constructed on first access.
export const supabaseServer: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    // @ts-expect-error — dynamic property forwarding
    return client[prop];
  },
});
