/**
 * Settings page — placeholder for Phase 8.
 */
import { useTheme } from "./learning";
import { TopBar } from "~/components/learning/TopBar";
import { Tracked, TrackedButton } from "~/components/learning/primitives";

export function meta() {
	return [{ title: "Napat · Learning · Settings" }];
}

export default function SettingsPage() {
	const { theme, t, toggleTheme } = useTheme();

	return (
		<div style={{ padding: "0 56px 120px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />
			<div style={{ maxWidth: 920, margin: "0 auto", paddingTop: "14vh" }}>
				<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost, display: "block", marginBottom: 24 }}>
					SETTINGS
				</Tracked>
				<h1
					style={{
						fontFamily: "Playfair Display, serif",
						fontSize: 56,
						fontWeight: 500,
						color: t.inkStrong,
						letterSpacing: "-0.02em",
						margin: 0,
					}}
				>
					Settings<span style={{ color: t.accent }}>.</span>
				</h1>
				<p
					style={{
						fontFamily: "Playfair Display, serif",
						fontSize: 22,
						color: t.inkGhost,
						fontStyle: "italic",
						marginTop: 12,
						marginBottom: 48,
					}}
				>
					coming soon.
				</p>

				{/* Theme toggle section */}
				<div style={{ borderTop: `1px solid ${t.divider}`, padding: "24px 0" }}>
					<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost, display: "block", marginBottom: 16 }}>
						APPEARANCE
					</Tracked>
					<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
						<Tracked size={10} tracking={0.25} style={{ color: t.inkMuted }}>
							THEME
						</Tracked>
						<TrackedButton t={t} onClick={toggleTheme}>
							{theme === "dark" ? "SWITCH TO LIGHT" : "SWITCH TO DARK"}
						</TrackedButton>
					</div>
				</div>

				{/* Logout */}
				<div style={{ borderTop: `1px solid ${t.divider}`, padding: "24px 0" }}>
					<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost, display: "block", marginBottom: 16 }}>
						SESSION
					</Tracked>
					<TrackedButton
						t={t}
						onClick={async () => {
							await fetch("/learning/api/session", {
								method: "DELETE",
								headers: { Origin: window.location.origin },
							});
							window.location.href = "/learning/gate";
						}}
					>
						SIGN OUT
					</TrackedButton>
				</div>
			</div>
		</div>
	);
}
