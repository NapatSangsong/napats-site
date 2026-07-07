import "~/styles/energy-dashboard.css";
import { EnergyDashboard } from "~/components/energy-dashboard/EnergyDashboard";
import type { Route } from "./+types/energy-dashboard";

export const meta: Route.MetaFunction = () => [
	{ title: "Energy Dashboard — Pro" },
	{ name: "robots", content: "noindex, nofollow" },
	{ name: "theme-color", content: "#0d1526" },
];

export const links: Route.LinksFunction = () => [
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
	},
];

export async function loader() {
	return null;
}

export default function EnergyDashboardPage() {
	return <EnergyDashboard />;
}
