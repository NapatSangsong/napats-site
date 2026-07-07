import type { Route } from "./+types/energy.report";
import { loadReport } from "~/lib/energy-report.server";

/**
 * Report data for /energy/report month switching: ?ym=YYYY-MM selects the
 * billing cycle starting the 2nd of that month; no param = current cycle.
 *
 * Deliberately UNGATED (user decision): the report page is open, so its data
 * endpoint is too. Read-only, fixed queries, validated param. Past cycles are
 * immutable → edge-cacheable.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const ym = new URL(request.url).searchParams.get("ym");
	try {
		const { payload, isPastCycle } = await loadReport(env, ym, Date.now());
		return Response.json(payload, {
			headers: {
				"Cache-Control": isPastCycle ? "public, max-age=3600" : "private, max-age=60",
			},
		});
	} catch (e) {
		return Response.json(
			{ ok: false, error: e instanceof Error ? e.message : "report failed" },
			{ status: 500, headers: { "Cache-Control": "no-store" } },
		);
	}
}
