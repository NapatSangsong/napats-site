import type { Route } from "./+types/energy.view";
import { BlueringAuthError } from "~/lib/bluering.server";
import { requireEnergyAuth } from "~/lib/energy-gate.server";
import { getView } from "~/lib/energy-model.server";

/**
 * The full /energy model as JSON: measured + forecast, billing cycle, outlook, history and
 * model accuracy. KV-cached 10 min and kept warm by the 15-minute cron.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireEnergyAuth(request, env);
	try {
		const view = await getView(env, env.RATE_LIMIT_KV);
		return Response.json({ ok: true, view }, { headers: { "Cache-Control": "private, max-age=60" } });
	} catch (e) {
		const expired = e instanceof BlueringAuthError;
		return Response.json(
			{ ok: false, reason: expired ? "token_expired" : "error", error: e instanceof Error ? e.message : String(e) },
			{ status: expired ? 503 : 502, headers: { "Cache-Control": "no-store" } },
		);
	}
}
