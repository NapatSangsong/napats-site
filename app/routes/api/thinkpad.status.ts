/** GET /api/thinkpad/status — the page's 30 s poll (public unless THINKPAD_PUBLIC is false). */
import type { Route } from "./+types/thinkpad.status";
import { thinkpadGate } from "~/lib/thinkpad-auth.server";
import { loadStatusView } from "~/lib/thinkpad-view.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await thinkpadGate.requireAuth(request, env.THINKPAD_PAGE_KEY);
	try {
		return Response.json({ ok: true, view: await loadStatusView(env) }, { headers: { "Cache-Control": "no-store" } });
	} catch (e) {
		console.error("[thinkpad-status]", e instanceof Error ? e.message : String(e));
		return Response.json({ ok: false, error: "status unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
	}
}
