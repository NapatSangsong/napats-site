/**
 * POST /api/thinkpad/command-status — progress of a remote command
 * (Connect-Vpn.ps1 on the ThinkPad), relayed to LINE. ThinkPad token only.
 */
import type { Route } from "./+types/thinkpad.command-status";
import { pushLine } from "~/lib/energy-alerts.server";
import { sourceForRequest } from "~/lib/thinkpad-auth.server";
import { commandStatusSchema, commandStatusText } from "~/lib/thinkpad-command.server";
import { CRD_DEFAULT_URL } from "~/lib/thinkpad-status";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const MAX_PUSHES_PER_COMMAND = 8;

export async function loader() {
	return json({ ok: false, error: "method not allowed" }, 405);
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
	if ((await sourceForRequest(request, env)) !== "thinkpad") return json({ ok: false, error: "unauthorized" }, 401);
	let body: unknown;
	try {
		body = JSON.parse((await request.text()).slice(0, 4096));
	} catch {
		return json({ ok: false, error: "invalid json" }, 400);
	}
	const r = commandStatusSchema.safeParse(body);
	if (!r.success) return json({ ok: false, error: "invalid status" }, 400);

	// cap pushes per command so a looping script can't burn the LINE quota
	const counter = `thinkpad:cmd-pushes:${r.data.id}`;
	const n = Number((await env.RATE_LIMIT_KV.get(counter)) ?? "0");
	if (n >= MAX_PUSHES_PER_COMMAND) return json({ ok: true, pushed: false });
	await env.RATE_LIMIT_KV.put(counter, String(n + 1), { expirationTtl: 3600 });
	await pushLine(env, commandStatusText(r.data, env.THINKPAD_CRD_URL || CRD_DEFAULT_URL));
	return json({ ok: true, pushed: true });
}
