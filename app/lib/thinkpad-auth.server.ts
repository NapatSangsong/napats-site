/**
 * Auth for the /thinkpad page and its reporters.
 *
 * Page: public while THINKPAD_PUBLIC is true (the page shows labels only — no
 * host names or IPs). Set it to false to put the page and its status API
 * behind THINKPAD_PAGE_KEY through the shared cookie key gate again.
 *
 * Ingest: each reporter sends `Authorization: Bearer <token>`. The worker only
 * holds hex(SHA-256(token)) per source (THINKPAD_INGEST_TOKEN_SHA256,
 * MAC_INGEST_TOKEN_SHA256), so a leaked secret listing can't be replayed.
 * The token decides the source — the body can't claim to be the other device.
 */
import { safeEqual } from "./energy-gate.server";
import { createKeyGate, sha256hex } from "./key-gate.server";
import type { DeviceSource } from "./thinkpad-schema";

/** true = /thinkpad and /api/thinkpad/status need no key (owner decision 2026-11-11) */
export const THINKPAD_PUBLIC = true;

const keyGate = createKeyGate("__Host-napats-thinkpad");
export const thinkpadGate = {
	requireAuth: (request: Request, key: string | undefined) =>
		THINKPAD_PUBLIC ? Promise.resolve() : keyGate.requireAuth(request, key),
	pageGate: (request: Request, key: string | undefined, path: string) =>
		THINKPAD_PUBLIC ? Promise.resolve() : keyGate.pageGate(request, key, path),
};

export interface IngestEnv {
	THINKPAD_INGEST_TOKEN_SHA256?: string;
	MAC_INGEST_TOKEN_SHA256?: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Returns the source the bearer token belongs to, or null. */
export async function sourceForRequest(request: Request, env: IngestEnv): Promise<DeviceSource | null> {
	const m = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(\S{16,512})$/);
	if (!m) return null;
	const got = await sha256hex(m[1]);
	const candidates: Array<[DeviceSource, string | undefined]> = [
		["thinkpad", env.THINKPAD_INGEST_TOKEN_SHA256],
		["mac", env.MAC_INGEST_TOKEN_SHA256],
	];
	let found: DeviceSource | null = null;
	// compare against every configured hash (no early exit) so timing doesn't
	// reveal which source matched
	for (const [source, want] of candidates) {
		const w = (want ?? "").trim().toLowerCase();
		if (HEX64.test(w) && safeEqual(got, w) && found === null) found = source;
	}
	return found;
}
