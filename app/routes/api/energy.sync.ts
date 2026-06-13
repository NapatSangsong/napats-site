/**
 * POST /api/energy/sync — on-demand "Sync now".
 * Runs the same Tuya→Supabase pull + daily rollup the 15-min cron does, so the
 * dashboard's consumption/charts can be refreshed immediately (e.g. when
 * comparing against the physical meter). Deliberately does NOT run the LINE
 * alerts — those should only fire on the scheduled cron, not on every click.
 */
import type { Route } from "./+types/energy.sync";
import { requireEnergyAuth } from "~/lib/energy-gate.server";
import { syncEnergyReadings } from "~/lib/energy-sync.server";
import { rollupDaily } from "~/lib/energy-rollup.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;

	if (request.method !== "POST") {
		return Response.json({ ok: false, error: "method not allowed" }, { status: 405 });
	}

	// CSRF: same-origin only
	const origin = request.headers.get("Origin");
	const url = new URL(request.url);
	if (origin && new URL(origin).host !== url.host) {
		return Response.json({ ok: false, error: "origin mismatch" }, { status: 403 });
	}

	await requireEnergyAuth(request, env);

	try {
		const sync = await syncEnergyReadings(env); // pull new Tuya logs into energy_readings
		const rollup = await rollupDaily(env); // refresh energy_daily for today/yesterday
		return Response.json(
			{ ok: true, fetched: sync.fetched, days: rollup.days },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (e) {
		return Response.json(
			{ ok: false, error: String(e) },
			{ status: 502, headers: { "Cache-Control": "no-store" } },
		);
	}
}
