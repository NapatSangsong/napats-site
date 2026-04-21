/**
 * Session management for the learning platform.
 * - PBKDF2-SHA-256 password verification (600k iterations)
 * - HMAC-SHA-256 stateless session cookie
 * - Rate limiting via Workers KV
 */

const PBKDF2_ITERATIONS = 100_000;
const COOKIE_NAME = "__Host-napats-learning";

// ── Password verification ──────────────────────────────────

/** Parse "salt_b64:hash_b64" format from MASTER_PASSWORD_HASH env var */
function parseMasterHash(envValue: string): { salt: Uint8Array; hash: Uint8Array } {
	const [saltB64, hashB64] = envValue.split(":");
	if (!saltB64 || !hashB64) throw new Error("Invalid MASTER_PASSWORD_HASH format");
	return {
		salt: base64ToBytes(saltB64),
		hash: base64ToBytes(hashB64),
	};
}

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<Uint8Array> {
	const enc = new TextEncoder();
	const baseKey = await crypto.subtle.importKey(
		"raw",
		enc.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		baseKey,
		256,
	);
	return new Uint8Array(bits);
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

export async function verifyPassword(password: string, masterHashEnv: string): Promise<boolean> {
	const { salt, hash } = parseMasterHash(masterHashEnv);
	const derived = await derivePasswordHash(password, salt);
	return timingSafeEqual(derived, hash);
}

// ── Session cookie ─────────────────────────────────────────

interface SessionPayload {
	iat: number;
	exp: number;
	dev: string;
	v: 1;
}

function base64UrlEncode(bytes: Uint8Array): string {
	const binary = String.fromCharCode(...bytes);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
	const padded = str.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		base64ToBytes(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
	return base64UrlEncode(new Uint8Array(sig));
}

async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
	const expected = await hmacSign(payload, secret);
	const a = new TextEncoder().encode(expected);
	const b = new TextEncoder().encode(signature);
	return timingSafeEqual(a, b);
}

export async function createSessionCookie(
	hmacSecret: string,
	options: { remember?: boolean; sessionDays?: number; rememberDays?: number } = {},
): Promise<{ cookie: string; devId: string }> {
	const devId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const maxAgeDays = options.remember
		? (options.rememberDays ?? 90)
		: (options.sessionDays ?? 30);
	const maxAge = maxAgeDays * 86400;

	const payload: SessionPayload = {
		iat: now,
		exp: now + maxAge,
		dev: devId,
		v: 1,
	};

	const payloadStr = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
	const signature = await hmacSign(payloadStr, hmacSecret);
	const token = `${payloadStr}.${signature}`;

	const cookie = [
		`${COOKIE_NAME}=${token}`,
		"HttpOnly",
		"Secure",
		"SameSite=Strict",
		"Path=/",
		`Max-Age=${maxAge}`,
	].join("; ");

	return { cookie, devId };
}

export async function verifySessionCookie(
	cookieHeader: string | null,
	hmacSecret: string,
): Promise<SessionPayload | null> {
	if (!cookieHeader) return null;

	const cookies = cookieHeader.split(";").map((c) => c.trim());
	const sessionCookie = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
	if (!sessionCookie) return null;

	const token = sessionCookie.slice(COOKIE_NAME.length + 1);
	const dotIdx = token.lastIndexOf(".");
	if (dotIdx === -1) return null;

	const payloadStr = token.slice(0, dotIdx);
	const signature = token.slice(dotIdx + 1);

	const valid = await hmacVerify(payloadStr, signature, hmacSecret);
	if (!valid) return null;

	try {
		const json = new TextDecoder().decode(base64UrlDecode(payloadStr));
		const payload = JSON.parse(json) as SessionPayload;

		if (payload.v !== 1) return null;
		if (payload.exp < Math.floor(Date.now() / 1000)) return null;

		return payload;
	} catch {
		return null;
	}
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function getCookieName(): string {
	return COOKIE_NAME;
}

// ── Rate limiting ──────────────────────────────────────────

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds?: number;
}

export async function checkRateLimit(
	kv: KVNamespace,
	ip: string,
	maxAttempts: number = 5,
	windowMinutes: number = 15,
): Promise<RateLimitResult> {
	const key = `rate:login:${ip}`;
	const windowMs = windowMinutes * 60 * 1000;

	const existing = await kv.get(key, "json") as { count: number; firstAttempt: number } | null;

	if (!existing) {
		return { allowed: true, remaining: maxAttempts - 1 };
	}

	const elapsed = Date.now() - existing.firstAttempt;
	if (elapsed > windowMs) {
		return { allowed: true, remaining: maxAttempts - 1 };
	}

	if (existing.count >= maxAttempts) {
		const retryAfter = Math.ceil((windowMs - elapsed) / 1000);
		return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter };
	}

	return { allowed: true, remaining: maxAttempts - existing.count - 1 };
}

export async function recordFailedAttempt(
	kv: KVNamespace,
	ip: string,
	windowMinutes: number = 15,
): Promise<void> {
	const key = `rate:login:${ip}`;
	const windowSeconds = windowMinutes * 60;

	const existing = await kv.get(key, "json") as { count: number; firstAttempt: number } | null;

	if (!existing || (Date.now() - existing.firstAttempt) > windowSeconds * 1000) {
		await kv.put(key, JSON.stringify({ count: 1, firstAttempt: Date.now() }), {
			expirationTtl: windowSeconds,
		});
	} else {
		await kv.put(key, JSON.stringify({ count: existing.count + 1, firstAttempt: existing.firstAttempt }), {
			expirationTtl: windowSeconds,
		});
	}
}
