/**
 * Learning platform layout — wraps all /learning/* routes.
 * Handles auth middleware + theme state.
 */
import { useState, useCallback, useEffect, createContext, useContext } from "react";
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
			Promise.resolve(
				supabase
					.from("sessions")
					.update({ last_seen_at: new Date().toISOString() })
					.eq("dev_id", session.dev),
			),
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
	const [showShortcuts, setShowShortcuts] = useState(false);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			// Don't capture when typing in input/textarea
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") return;

			if (e.key === "?") { e.preventDefault(); setShowShortcuts(s => !s); }
			if (e.key === "Escape") { setShowShortcuts(false); }
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

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
				<div className="learning-tab-bar-wrap">
					<MobileTabBar t={t} />
				</div>
			</div>
			{showShortcuts && (
				<div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowShortcuts(false)}>
					<div style={{ background: t.bgElevated, border: `1px solid ${t.dividerStrong}`, padding: 32, maxWidth: 400, width: "90%" }} onClick={e => e.stopPropagation()}>
						<h3 style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkStrong, margin: "0 0 20px" }}>Keyboard Shortcuts</h3>
						{[
							["?", "Show/hide shortcuts"],
							["Esc", "Close dialogs"],
						].map(([key, desc]) => (
							<div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${t.divider}` }}>
								<code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: t.ink }}>{key}</code>
								<span style={{ fontSize: 13, color: t.inkMuted }}>{desc}</span>
							</div>
						))}
						<button onClick={() => setShowShortcuts(false)} style={{ marginTop: 20, width: "100%", padding: "8px", border: `1px solid ${t.divider}`, background: "transparent", color: t.ink, cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em" }}>CLOSE (ESC)</button>
					</div>
				</div>
			)}
		</ThemeContext.Provider>
	);
}
