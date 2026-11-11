/**
 * Cookie key gate for private pages — the same mechanism as
 * energy-gate.server.ts, parameterised by cookie name and env key so a new
 * private page doesn't have to copy it (and doesn't inherit ENERGY_PUBLIC).
 *
 *   /<page>?key=<KEY>  → httpOnly cookie = hex(SHA-256(KEY)), redirect to /<page>
 *   wrong / missing key → 404 (indistinguishable from a missing page)
 *   rotating KEY        → every old cookie stops matching
 */
import { data, redirect } from "react-router";
import { safeEqual } from "./energy-gate.server";

const enc = new TextEncoder();

export async function sha256hex(s: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface KeyGate {
	isAuthorized(request: Request, key: string | undefined): Promise<boolean>;
	/** Throws 404 unless the gate cookie matches. */
	requireAuth(request: Request, key: string | undefined): Promise<void>;
	/** Page loader helper: handles ?key= (cookie + redirect, or 404) then requireAuth. */
	pageGate(request: Request, key: string | undefined, path: string): Promise<void>;
}

export function createKeyGate(cookieName: string, maxAgeS = 180 * 24 * 3600): KeyGate {
	const cookie = (hash: string) =>
		`${cookieName}=${hash}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
	const re = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`);

	async function isAuthorized(request: Request, key: string | undefined): Promise<boolean> {
		if (!key) return false;
		const m = (request.headers.get("Cookie") ?? "").match(re);
		if (!m) return false;
		return safeEqual(m[1], await sha256hex(key));
	}

	async function requireAuth(request: Request, key: string | undefined): Promise<void> {
		if (!(await isAuthorized(request, key))) throw data(null, { status: 404 });
	}

	async function pageGate(request: Request, key: string | undefined, path: string): Promise<void> {
		const given = new URL(request.url).searchParams.get("key");
		if (given !== null) {
			if (key && safeEqual(given, key)) {
				throw redirect(path, { headers: { "Set-Cookie": cookie(await sha256hex(key)) } });
			}
			throw data(null, { status: 404 });
		}
		await requireAuth(request, key);
	}

	return { isAuthorized, requireAuth, pageGate };
}
