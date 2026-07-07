import "~/styles/energy-report.css";
import type { Route } from "./+types/energy-report";
import { EnergyReport } from "~/components/energy-report/EnergyReport";
import { loadReport } from "~/lib/energy-report.server";

export const meta: Route.MetaFunction = () => [
	{ title: "Energy Report — รายรอบบิล" },
	{ name: "robots", content: "noindex, nofollow" },
	{ name: "theme-color", content: "#0d1526" },
];

export const links: Route.LinksFunction = () => [
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
	},
];

/**
 * Server-side data: daily history + the selected cycle's hourly matrix.
 * Open access (user decision) — no requireEnergyAuth. Raw readings never
 * reach the client; see energy-report.server.ts. A data-source failure
 * degrades to an error card instead of a 500 page.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const ym = new URL(request.url).searchParams.get("ym");
	try {
		const { payload } = await loadReport(context.cloudflare.env, ym, Date.now());
		return payload;
	} catch (e) {
		return {
			ok: false as const,
			error: e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ",
			fetchedAt: Date.now(),
		};
	}
}

export default function EnergyReportPage({ loaderData }: Route.ComponentProps) {
	return <EnergyReport initial={loaderData} />;
}
