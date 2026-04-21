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
	return title
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
