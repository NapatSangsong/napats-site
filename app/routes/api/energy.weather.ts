import type { Route } from "./+types/energy.weather";
import { requireEnergyAuth } from "~/lib/energy-gate.server";

/** Bang Yai, Nonthaburi — the meter's location. */
const LAT = 13.8225;
const LON = 100.406;

/**
 * Gated weather snapshot from Open-Meteo (free, no API key). Returns current
 * conditions + today's rain chance for the tiny house-scene widget, plus
 * cloud_cover / shortwave_radiation which a future "solar potential" readout
 * can use to size a rooftop PV recommendation.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	await requireEnergyAuth(request, context.cloudflare.env);

	const url =
		"https://api.open-meteo.com/v1/forecast" +
		`?latitude=${LAT}&longitude=${LON}` +
		"&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,precipitation,shortwave_radiation,is_day" +
		"&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min" +
		"&timezone=Asia%2FBangkok&forecast_days=1";

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) throw new Error(`open-meteo ${res.status}`);
		const j = (await res.json()) as {
			current?: Record<string, number>;
			daily?: Record<string, number[]>;
		};
		const c = j.current ?? {};
		const d = j.daily ?? {};
		return Response.json(
			{
				ok: true,
				tempC: c.temperature_2m ?? null,
				feelsC: c.apparent_temperature ?? null,
				humidity: c.relative_humidity_2m ?? null,
				code: c.weather_code ?? null,
				cloudPct: c.cloud_cover ?? null,
				radiationWm2: c.shortwave_radiation ?? null,
				isDay: c.is_day === 1,
				precipProb: d.precipitation_probability_max?.[0] ?? null,
				tmaxC: d.temperature_2m_max?.[0] ?? null,
				tminC: d.temperature_2m_min?.[0] ?? null,
				fetchedAt: Date.now(),
			},
			{ headers: { "Cache-Control": "private, max-age=600" } },
		);
	} catch {
		return Response.json(
			{ ok: false },
			{ status: 502, headers: { "Cache-Control": "no-store" } },
		);
	}
}
