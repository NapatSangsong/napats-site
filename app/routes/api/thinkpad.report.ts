/**
 * POST /api/thinkpad/report — heartbeat ingest from the ThinkPad / Mac reporters.
 * Auth: `Authorization: Bearer <token>`; the token picks the source
 * (see thinkpad-auth.server.ts). Body: JSON matching thinkpad-schema.ts.
 * Never logs the token, the body or anything host-like.
 */
import type { Route } from "./+types/thinkpad.report";
import { sourceForRequest } from "~/lib/thinkpad-auth.server";
import { MAX_BODY_BYTES, parsePayload, summarize, type ThinkpadPayload } from "~/lib/thinkpad-schema";
import { getStore } from "~/lib/thinkpad-store.server";

const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function loader() {
	return json({ ok: false, error: "method not allowed" }, 405);
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

	const source = await sourceForRequest(request, env);
	if (!source) return json({ ok: false, error: "unauthorized" }, 401);

	const declared = Number(request.headers.get("Content-Length") ?? "0");
	if (declared > MAX_BODY_BYTES) return json({ ok: false, error: "payload too large" }, 413);
	const text = await request.text();
	if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json({ ok: false, error: "payload too large" }, 413);

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return json({ ok: false, error: "invalid json" }, 400);
	}
	const parsed = parsePayload(source, body);
	if (!parsed.ok) {
		console.warn(`[thinkpad-report] ${source} rejected: ${parsed.error}`);
		return json({ ok: false, error: parsed.error }, 400);
	}

	const extra =
		source === "thinkpad" ? summarize(parsed.payload as ThinkpadPayload) : { vpn_up: null, kbs_ok: null };
	try {
		await getStore(env).insert({
			source,
			reported_at: parsed.payload.reported_at,
			...extra,
			payload: parsed.payload,
		});
	} catch (e) {
		console.error(`[thinkpad-report] ${source} store failed:`, e instanceof Error ? e.message : String(e));
		return json({ ok: false, error: "store failed" }, 502);
	}
	return json({ ok: true, source });
}
