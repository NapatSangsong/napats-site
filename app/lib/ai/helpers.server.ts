/**
 * Shared helpers for AI API routes.
 */
import { verifySessionCookie } from "~/lib/session.server";

interface RouteEnv {
	SESSION_HMAC_SECRET: string;
}

/**
 * Verify CSRF (Origin header) and session cookie.
 * Returns null on success, or a Response to return immediately on failure.
 */
export async function requireAuth(
	request: Request,
	env: RouteEnv,
): Promise<Response | null> {
	// CSRF check
	const origin = request.headers.get("Origin");
	const url = new URL(request.url);
	if (origin && new URL(origin).host !== url.host) {
		return Response.json({ message: "origin mismatch" }, { status: 403 });
	}

	// Session check
	const session = await verifySessionCookie(
		request.headers.get("Cookie"),
		env.SESSION_HMAC_SECRET,
	);
	if (!session) {
		return Response.json({ message: "unauthorized" }, { status: 401 });
	}

	return null;
}

/**
 * Create an SSE Response from an async generator or manual stream logic.
 */
export function sseResponse(stream: ReadableStream): Response {
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}

/**
 * Create an SSE ReadableStream with helper to send events.
 */
export function createSSEStream(
	handler: (helpers: {
		send: (event: string, data: string) => void;
		controller: ReadableStreamDefaultController<Uint8Array>;
	}) => Promise<void>,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		async start(controller) {
			const send = (event: string, data: string) => {
				// SSE spec: multi-line data must use separate data: lines
				const dataLines = data.split("\n").map((line) => `data: ${line}`).join("\n");
				controller.enqueue(encoder.encode(`event: ${event}\n${dataLines}\n\n`));
			};
			try {
				await handler({ send, controller });
			} catch (err) {
				const msg = err instanceof Error ? err.message : "internal error";
				send("error", JSON.stringify({ message: msg }));
			} finally {
				try {
					controller.close();
				} catch {
					// already closed
				}
			}
		},
	});
}

/**
 * Generate a URL-safe slug from a title string.
 */
export function slugify(title: string): string {
	// ASCII-only slug — strip all non-ASCII to avoid URL encoding issues
	let slug = title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")    // Strip diacritics
		.replace(/[^a-z0-9\s-]/g, "")       // ASCII only
		.replace(/[\s_]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);

	// Fallback for non-ASCII titles (Thai, CJK, etc.)
	if (!slug) {
		let hash = 0;
		for (let i = 0; i < title.length; i++) {
			hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
		}
		slug = `course-${Math.abs(hash).toString(36)}-${Date.now().toString(36)}`;
	}

	return slug;
}
