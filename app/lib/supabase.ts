import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-side client. The publishable key is designed to be public; RLS
// policies on the Supabase side (see NapatDevPWD repo, migration
// create_vault_sync_e2e) enforce "users can only read their own vault row".
//
// SSR note: we create the client lazily so this module stays safe to import
// from Cloudflare Workers AND the browser. On the server the client reads
// URL/key from env; in the browser it reads from import.meta.env.

export type VaultSyncRow = {
	user_id: string;
	ciphertext: string; // `\x...` hex from PostgREST
	salt: string;
	verifier: string;
	schema_version: number;
	version_counter: number;
	updated_at: string;
};

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
	if (browserClient) return browserClient;
	const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
	const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
	if (!url || !key) {
		throw new Error(
			"Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — set them in .env or Cloudflare vars",
		);
	}
	browserClient = createClient(url, key, {
		auth: { persistSession: true, autoRefreshToken: true },
	});
	return browserClient;
}

/// PostgREST returns bytea as `\x<hex>`. Decode to a Uint8Array.
export function hexToBytes(hex: string): Uint8Array {
	const body = hex.startsWith("\\x") ? hex.slice(2) : hex;
	const out = new Uint8Array(body.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(body.substr(i * 2, 2), 16);
	}
	return out;
}
