import type { Route } from "./+types/energy.view";
import { BlueringAuthError } from "~/lib/bluering.server";
import { requireEnergyAuth } from "~/lib/energy-gate.server";
import { getView, pullView } from "~/lib/energy-model.server";

/**
 * The full /energy model as JSON: measured + forecast, billing cycle, outlook, history and
 * model accuracy. Normally the cron-built KV view; `?fresh=1` (pull-to-refresh) rebuilds
 * from BlueRing now, without a KV write.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireEnergyAuth(request, env);
	try {
		const fresh = new URL(request.url).searchParams.get("fresh") === "1";
		const view = fresh ? await pullView(env, env.RATE_LIMIT_KV) : await getView(env, env.RATE_LIMIT_KV);
		return Response.json({ ok: true, view }, { headers: { "Cache-Control": fresh ? "no-store" : "private, max-age=60" } });
	} catch (e) {
		const expired = e instanceof BlueringAuthError;
		return Response.json(
			{ ok: false, reason: expired ? "token_expired" : "error", error: e instanceof Error ? e.message : String(e) },
			{ status: expired ? 503 : 502, headers: { "Cache-Control": "no-store" } },
		);
	}
}
