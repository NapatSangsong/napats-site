/**
 * POST /learning/api/session — login (verify master password)
 * DELETE /learning/api/session — logout (clear cookie)
 */
import { z } from "zod";
import type { Route } from "./+types/session";
import {
	verifyPassword,
	createSessionCookie,
	clearSessionCookie,
	verifySessionCookie,
	checkRateLimit,
	recordFailedAttempt,
} from "~/lib/session.server";
import { createServiceClient } from "~/lib/supabase.server";

const LoginBody = z.object({
	password: z.string().min(1),
	remember: z.boolean().optional(),
});

export async function action({ request, context }: Route.ActionArgs) {
	try {
		const env = context.cloudflare.env;

		// CSRF: require matching Origin header
		const origin = request.headers.get("Origin");
		const url = new URL(request.url);
		if (origin && new URL(origin).host !== url.host) {
			return Response.json({ message: "origin mismatch" }, { status: 403 });
		}

		if (request.method === "POST") {
			return handleLogin(request, env, context.cloudflare.ctx);
		}

		if (request.method === "DELETE") {
			return handleLogout(request, env);
		}

		return Response.json({ message: "method not allowed" }, { status: 405 });
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown error";
		return Response.json({ message, stack: err instanceof Error ? err.stack : undefined }, { status: 500 });
	}
}

async function handleLogin(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
) {
	// Rate limiting
	const ip = request.headers.get("CF-Connecting-IP") || "unknown";
	const rateLimit = await checkRateLimit(
		env.RATE_LIMIT_KV,
		ip,
		Number(env.LEARNING_RATE_LIMIT_MAX) || 5,
		Number(env.LEARNING_RATE_LIMIT_WINDOW_MINUTES) || 15,
	);

	if (!rateLimit.allowed) {
		return Response.json(
			{
				message: "too many attempts",
				retry_after: rateLimit.retryAfterSeconds,
			},
			{ status: 429 },
		);
	}

	// Parse body
	let body: z.infer<typeof LoginBody>;
	try {
		body = LoginBody.parse(await request.json());
	} catch {
		return Response.json({ message: "invalid request" }, { status: 400 });
	}

	// Verify password
	const valid = await verifyPassword(body.password, env.MASTER_PASSWORD_HASH);

	if (!valid) {
		await recordFailedAttempt(
			env.RATE_LIMIT_KV,
			ip,
			Number(env.LEARNING_RATE_LIMIT_WINDOW_MINUTES) || 15,
		);
		return Response.json(
			{ message: "wrong password.", remaining: rateLimit.remaining - 1 },
			{ status: 401 },
		);
	}

	// Create session
	const { cookie, devId } = await createSessionCookie(
		env.SESSION_HMAC_SECRET,
		{
			remember: body.remember,
			sessionDays: Number(env.LEARNING_SESSION_DAYS) || 30,
			rememberDays: Number(env.LEARNING_REMEMBER_DAYS) || 90,
		},
	);

	// Record session in Supabase (fire-and-forget)
	try {
		const supabase = createServiceClient(env);
		ctx.waitUntil(
			Promise.resolve(
				supabase.from("sessions").upsert({
					dev_id: devId,
					label: detectDeviceLabel(request.headers.get("User-Agent")),
					user_agent: request.headers.get("User-Agent")?.slice(0, 256),
					ip_hash: await hashIp(ip),
					last_seen_at: new Date().toISOString(),
				}),
			),
		);
	} catch {
		// Non-critical — session cookie is the source of truth
	}

	return Response.json(
		{ ok: true },
		{ headers: { "Set-Cookie": cookie } },
	);
}

async function handleLogout(request: Request, env: Env) {
	const session = await verifySessionCookie(
		request.headers.get("Cookie"),
		env.SESSION_HMAC_SECRET,
	);

	if (session) {
		// Mark session as revoked in Supabase (best-effort)
		try {
			const supabase = createServiceClient(env);
			await supabase
				.from("sessions")
				.update({ revoked_at: new Date().toISOString() })
				.eq("dev_id", session.dev);
		} catch {
			// Non-critical
		}
	}

	return new Response(null, {
		status: 204,
		headers: { "Set-Cookie": clearSessionCookie() },
	});
}

function detectDeviceLabel(ua: string | null): string {
	if (!ua) return "Unknown";
	if (ua.includes("iPhone")) return "iPhone";
	if (ua.includes("iPad")) return "iPad";
	if (ua.includes("Android")) return "Android";
	if (ua.includes("Mac")) return "Mac";
	if (ua.includes("Windows")) return "Windows";
	if (ua.includes("Linux")) return "Linux";
	return "Browser";
}

async function hashIp(ip: string): Promise<string> {
	const enc = new TextEncoder();
	const hash = await crypto.subtle.digest("SHA-256", enc.encode(ip));
	return Array.from(new Uint8Array(hash))
		.slice(0, 8)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
