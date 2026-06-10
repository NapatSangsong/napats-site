/**
 * Augment the auto-generated Env interface with secret bindings
 * that wrangler types can't detect (they're set via `wrangler secret put`).
 */
declare namespace Cloudflare {
	interface Env {
		// Secrets (set via wrangler secret put)
		SUPABASE_URL: string;
		SUPABASE_SERVICE_ROLE_KEY: string;
		ANTHROPIC_API_KEY: string;
		MASTER_PASSWORD_HASH: string;
		SESSION_HMAC_SECRET: string;
		// LINE Bot secrets
		LINE_CHANNEL_ACCESS_TOKEN: string;
		LINE_CHANNEL_SECRET: string;
		// Energy dashboard secrets (TUYA_ENDPOINT is a var in wrangler.json)
		TUYA_ACCESS_ID: string;
		TUYA_ACCESS_SECRET: string;
		TUYA_DEVICE_ID: string;
		ENERGY_PAGE_KEY: string;
	}
}
