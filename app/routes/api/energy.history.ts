import type { Route } from "./+types/energy.history";
import { requireEnergyAuth } from "~/lib/energy-gate.server";
import { createServiceClient } from "~/lib/supabase.server";

/** PostgREST caps responses at 1000 rows — page through with .range() */
const PAGE = 1000;

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireEnergyAuth(request, env);

	const daysParam = Number(new URL(request.url).searchParams.get("days") ?? 30);
	const days = Math.min(60, Math.max(1, Number.isFinite(daysParam) ? daysParam : 30));
	const since = Date.now() - days * 86400 * 1000;

	const supabase = createServiceClient(env);
	const points: [number, number][] = [];
	for (let offset = 0; ; offset += PAGE) {
		const { data, error } = await supabase
			.from("energy_readings")
			.select("event_time,value")
			.gte("event_time", since)
			.order("event_time", { ascending: true })
			.range(offset, offset + PAGE - 1);
		if (error) {
			return Response.json(
				{ ok: false, error: error.message },
				{ status: 500, headers: { "Cache-Control": "no-store" } },
			);
		}
		for (const row of data ?? []) {
			points.push([Number(row.event_time), Number(row.value)]);
		}
		if (!data || data.length < PAGE) break;
	}

	return Response.json(
		{ ok: true, points, days, fetchedAt: Date.now() },
		{ headers: { "Cache-Control": "private, max-age=60" } },
	);
}
