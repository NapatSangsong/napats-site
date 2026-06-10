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
			{ headers: { "Cache-Control": "private, max-age=10" } },
		);
	} catch (e) {
		return Response.json(
			{ ok: false, error: String(e), latency_ms: Date.now() - startedAt },
			{ status: 503, headers: { "Cache-Control": "no-store" } },
		);
	}
}
