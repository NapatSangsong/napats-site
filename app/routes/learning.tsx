/**
 * Learning platform layout — wraps all /learning/* routes.
 * Handles auth middleware + theme state.
 */
import { useState, useCallback, createContext, useContext } from "react";
import { Outlet, redirect } from "react-router";
import type { Route } from "./+types/learning";
import { verifySessionCookie } from "~/lib/session.server";
import { createServiceClient } from "~/lib/supabase.server";
import { tokens, type ThemeTokens, type ThemeMode } from "~/lib/theme";
import { MobileTabBar } from "~/components/learning/MobileTabBar";
import "~/styles/learning.css";

// Theme context so any child can read tokens + toggle
interface ThemeContextValue {
	theme: ThemeMode;
	t: ThemeTokens;
	toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextValue>({
	theme: "dark",
	t: tokens.dark,
	toggleTheme: () => {},
});
export function useTheme() {
	return useContext(ThemeContext);
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const url = new URL(request.url);

	const session = await verifySessionCookie(
		request.headers.get("Cookie"),
		env.SESSION_HMAC_SECRET,
	);

	if (!session) {
		const next = url.pathname !== "/learning" ? url.pathname : "";
		const params = next ? `?next=${encodeURIComponent(next)}` : "";
		return redirect(`/learning/gate${params}`);
	}

	// Check if session is revoked in Supabase (best-effort)
	try {
		const supabase = createServiceClient(env);
		const { data } = await supabase
			.from("sessions")
			.select("revoked_at")
			.eq("dev_id", session.dev)
			.single();

		if (data?.revoked_at) {
			const next = url.pathname !== "/learning" ? url.pathname : "";
			const params = next ? `?next=${encodeURIComponent(next)}` : "";
			return redirect(`/learning/gate${params}`);
		}

		// Update last_seen_at (fire-and-forget)
		context.cloudflare.ctx.waitUntil(
			supabase
				.from("sessions")
				.update({ last_seen_at: new Date().toISOString() })
				.eq("dev_id", session.dev),
		);
	} catch {
		// Supabase down — degrade open
	}

	// Read theme preference from cookie (fast, no DB hit)
	const themeCookie = request.headers
		.get("Cookie")
		?.split(";")
		.find((c) => c.trim().startsWith("napats-learning-theme="));
	const savedTheme = themeCookie?.split("=")[1]?.trim();

	return {
		session: { dev: session.dev },
		theme: (savedTheme === "dark" ? "dark" : "light") as ThemeMode,
	};
}

export default function LearningLayout({ loaderData }: Route.ComponentProps) {
	const [theme, setTheme] = useState<ThemeMode>(loaderData.theme);
	const t = tokens[theme];

	const toggleTheme = useCallback(() => {
		setTheme((prev) => {
			const next = prev === "dark" ? "light" : "dark";
			// Persist to cookie (no httponly needed, just a preference)
			document.cookie = `napats-learning-theme=${next};path=/;max-age=31536000;SameSite=Strict`;
			return next;
		});
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, t, toggleTheme }}>
			<div
				style={{
					minHeight: "100vh",
					background: t.bg,
					color: t.ink,
					transition: "background .4s, color .4s",
				}}
				className="font-sans"
			>
				<Outlet />
				<div className="learning-mobile-only">
					<MobileTabBar t={t} />
				</div>
			</div>
		</ThemeContext.Provider>
	);
}
