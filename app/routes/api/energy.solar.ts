import type { Route } from "./+types/energy.solar";
import { requireEnergyAuth } from "~/lib/energy-gate.server";

/** Bang Yai, Nonthaburi — same site as the meter. */
const LAT = 13.8225;
const LON = 100.406;

/**
 * Rooftop-PV production forecast for the 4 kWp system (installed 21 ก.ค. 2569),
 * driven by Open-Meteo hourly shortwave radiation (GHI).
 *
 * Model (transparent, GHI-based):
 *   hourly kWh = (GHI[W/m²] / 1000) × kWp × PR
 * where 1000 W/m² = STC and PR (performance ratio) folds in inverter, thermal
 * and soiling losses. A clear Bangkok day lands ~16 kWh/day for 4 kWp.
 */
const KWP = 4.0;
const PR = 0.75;

export async function loader({ request, context }: Route.LoaderArgs) {
	await requireEnergyAuth(request, context.cloudflare.env);

	const url =
		"https://api.open-meteo.com/v1/forecast" +
		`?latitude=${LAT}&longitude=${LON}` +
		"&hourly=shortwave_radiation,cloud_cover" +
		"&timezone=Asia%2FBangkok&forecast_days=4";

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) throw new Error(`open-meteo ${res.status}`);
		const j = (await res.json()) as {
			hourly?: {
				time: string[];
				shortwave_radiation: (number | null)[];
				cloud_cover: (number | null)[];
			};
		};
		const H = j.hourly;
		if (!H?.time?.length) throw new Error("no hourly data");

		const byDay = new Map<string, { hour: number; kwh: number; cloud: number }[]>();
		for (let i = 0; i < H.time.length; i++) {
			const t = H.time[i]; // "YYYY-MM-DDTHH:00" in Asia/Bangkok
			const date = t.slice(0, 10);
			const hour = Number(t.slice(11, 13));
			const ghi = H.shortwave_radiation[i] ?? 0;
			const kwh = (ghi / 1000) * KWP * PR;
			const cloud = Math.round(H.cloud_cover?.[i] ?? 0);
			const arr = byDay.get(date) ?? [];
			arr.push({ hour, kwh, cloud });
			byDay.set(date, arr);
		}

		const days = [...byDay.entries()].map(([date, hrs]) => {
			const total = hrs.reduce((s, h) => s + h.kwh, 0);
			const peak = hrs.reduce((mx, h) => (h.kwh > mx.kwh ? h : mx), { hour: 12, kwh: 0 });
			return {
				date,
				totalKwh: Math.round(total * 100) / 100,
				peakHour: peak.hour,
				peakKw: Math.round(peak.kwh * 100) / 100,
				hours: hrs.map((h) => ({ hour: h.hour, kwh: Math.round(h.kwh * 1000) / 1000, cloud: h.cloud })),
			};
		});

		return Response.json(
			{ ok: true, kwp: KWP, pr: PR, days, fetchedAt: Date.now() },
			{ headers: { "Cache-Control": "private, max-age=3600" } },
		);
	} catch {
		return Response.json(
			{ ok: false },
			{ status: 502, headers: { "Cache-Control": "no-store" } },
		);
	}
}
