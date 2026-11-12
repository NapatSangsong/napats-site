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
		/** Owner's LINE userId for proactive energy alerts (push API).
		 *  Optional — alerts are logged no-ops until this is set. */
		LINE_USER_ID: string;
		// Energy dashboard secrets (TUYA_ENDPOINT is a var in wrangler.json)
		TUYA_ACCESS_ID: string;
		TUYA_ACCESS_SECRET: string;
		TUYA_DEVICE_ID: string;
		ENERGY_PAGE_KEY: string;
		/** BlueRing PV cloud bearer token — from `node tools/bluering/bluering.mjs login`.
		 *  Optional: /api/energy/bluering answers 503 token_expired until it is set. */
		BLUERING_TOKEN?: string;
		/** MEA receipts for bill calibration, JSON [{ read: "YYYY-MM-DD", kwh, thb }]. A secret
		 *  because the repo is public. Optional: falls back to BlueRing's own meter. */
		MEA_BILLS?: string;
		// ThinkPad / VPN status page (/thinkpad)
		/** only used when THINKPAD_PUBLIC (thinkpad-auth.server.ts) is false */
		THINKPAD_PAGE_KEY?: string;
		/** hex SHA-256 of each reporter's bearer token (the token itself is never stored) */
		THINKPAD_INGEST_TOKEN_SHA256: string;
		MAC_INGEST_TOKEN_SHA256: string;
		/** dev only: "memory" = in-process store instead of Supabase (.dev.vars) */
		THINKPAD_STORE?: string;
		/** optional: the ThinkPad's own Chrome Remote Desktop link (else the device list) */
		THINKPAD_CRD_URL?: string;
		/** public JWK (RSA-OAEP-256) of the ThinkPad's command key — New-CommandKey.ps1 */
		THINKPAD_CMD_PUBLIC_JWK?: string;
	}
}
