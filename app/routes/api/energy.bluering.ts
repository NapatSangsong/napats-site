import type { Route } from "./+types/energy.bluering";
import { requireEnergyAuth } from "~/lib/energy-gate.server";
import {
	BlueringAuthError,
	BlueringHttpError,
	bangkokToday,
	getPlant,
	getSeries,
	getSnapshot,
	SERIES_TYPES,
	type SeriesType,
} from "~/lib/bluering.server";

/**
 * Real rooftop-PV data from the BlueRing cloud (complements /api/energy/solar, which is
 * only an Open-Meteo forecast).
 *
 *   GET /api/energy/bluering
 *       plant info, latest 15-min reading (W) and today's kWh totals (60 s KV cache)
 *   GET /api/energy/bluering?series=minute|daily|monthly&date=YYYY-MM-DD
 *       minute  = that Bangkok day in 15-min buckets, values in average kW
 *       daily   = from that day on, one row per day, kWh
 *       monthly = every month since install, kWh
 *
 * Only curated fields go out (no serials, lead number or gateway IP), because the
 * /api/energy/* routes can be public (ENERGY_PUBLIC). A missing or expired token answers
 * 503 { reason: "token_expired" }.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireEnergyAuth(request, env);
	const kv = env.RATE_LIMIT_KV;
	const q = new URL(request.url).searchParams;
	const startedAt = Date.now();

	try {
		const series = q.get("series");
		if (series) {
			if (!SERIES_TYPES.includes(series as SeriesType)) {
				return Response.json({ ok: false, error: `series must be one of ${SERIES_TYPES.join(", ")}` }, { status: 400 });
			}
			const date = q.get("date") ?? bangkokToday();
			if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
				return Response.json({ ok: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
			}
			const plant = await getPlant(env, kv);
			const points = await getSeries(env, plant.gatewayId, series as SeriesType, date);
			return Response.json(
				{
					ok: true,
					series,
					date,
					unit: series === "minute" ? "kW (15-min average)" : "kWh",
					points,
					latency_ms: Date.now() - startedAt,
				},
				// buckets land ~5 min after each 15-min slot; older days never change
				{ headers: { "Cache-Control": `private, max-age=${date < bangkokToday() && series !== "monthly" ? 3600 : 300}` } },
			);
		}

		const snap = await getSnapshot(env, kv);
		return Response.json(
			{ ok: true, ...snap, latency_ms: Date.now() - startedAt },
			{ headers: { "Cache-Control": "private, max-age=30" } },
		);
	} catch (e) {
		const reason = e instanceof BlueringAuthError ? "token_expired" : e instanceof BlueringHttpError ? `upstream_${e.status}` : "error";
		return Response.json(
			{ ok: false, reason, error: e instanceof Error ? e.message : String(e), latency_ms: Date.now() - startedAt },
			{ status: e instanceof BlueringAuthError ? 503 : 502, headers: { "Cache-Control": "no-store" } },
		);
	}
}
