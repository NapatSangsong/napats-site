import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client for server-side use.
 * Uses SUPABASE_SERVICE_ROLE_KEY if available, falls back to anon key.
 * RLS is disabled on learning tables, so the anon key works too.
 */
export function createServiceClient(env: {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
}): SupabaseClient {
	return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}
