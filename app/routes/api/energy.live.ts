import type { Route } from "./+types/energy.live";
import { requireEnergyAuth } from "~/lib/energy-gate.server";
import { getLive } from "~/lib/tuya.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireEnergyAuth(request, env);
	const startedAt = Date.now();
	try {
		const live = await getLive(env, env.RATE_LIMIT_KV);
		return Response.json(
			{ ok: true, live, latency_ms: Date.now() - startedAt },
			// no-store: every refresh/poll hits Tuya fresh (used to compare against the
			// physical meter — must always be the latest reading, never browser-cached).
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (e) {
		return Response.json(
			{ ok: false, error: String(e), latency_ms: Date.now() - startedAt },
			{ status: 503, headers: { "Cache-Control": "no-store" } },
		);
	}
}
