/**
 * Simple key gate for the private /energy page.
 * /energy?key=<ENERGY_PAGE_KEY> sets an httpOnly cookie holding
 * hex(SHA-256(key)); every page/API request recomputes the hash from the env
 * secret and compares. Rotating ENERGY_PAGE_KEY invalidates all cookies.
 * Wrong/missing key is indistinguishable from a missing page (404).
 */
import { data } from "react-router";

const COOKIE_NAME = "__Host-napats-energy";
const COOKIE_MAX_AGE = 180 * 24 * 3600; // 180 days

const enc = new TextEncoder();

async function sha256hex(s: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

export function safeEqual(a: string, b: string): boolean {
	return timingSafeEqual(enc.encode(a), enc.encode(b));
}

export async function keyHash(env: { ENERGY_PAGE_KEY: string }): Promise<string> {
	return sha256hex(env.ENERGY_PAGE_KEY);
}

export function gateCookie(hash: string): string {
	return `${COOKIE_NAME}=${hash}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export async function isAuthorized(
	request: Request,
	env: { ENERGY_PAGE_KEY: string },
): Promise<boolean> {
	if (!env.ENERGY_PAGE_KEY) return false;
	const cookies = request.headers.get("Cookie") ?? "";
	const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
	if (!match) return false;
	return safeEqual(match[1], await keyHash(env));
}

/** Throws a 404 response (page indistinguishable from non-existent) */
export async function requireEnergyAuth(
	request: Request,
	env: { ENERGY_PAGE_KEY: string },
): Promise<void> {
	if (!(await isAuthorized(request, env))) {
		throw data(null, { status: 404 });
	}
}
