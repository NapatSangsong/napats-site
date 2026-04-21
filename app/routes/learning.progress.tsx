/**
 * Progress dashboard — placeholder for Phase 8.
 */
import { useTheme } from "./learning";
import { TopBar } from "~/components/learning/TopBar";
import { Tracked } from "~/components/learning/primitives";

export function meta() {
	return [{ title: "Napat · Learning · Progress" }];
}

export default function ProgressPage() {
	const { theme, t, toggleTheme } = useTheme();

	return (
		<div style={{ padding: "0 56px 120px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />
			<div style={{ maxWidth: 920, margin: "0 auto", paddingTop: "14vh", textAlign: "center" }}>
				<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost, display: "block", marginBottom: 24 }}>
					03 / PROGRESS
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
					Progress<span style={{ color: t.accent }}>.</span>
				</h1>
				<p
					style={{
						fontFamily: "Playfair Display, serif",
						fontSize: 22,
						color: t.inkGhost,
						fontStyle: "italic",
						marginTop: 12,
					}}
				>
					coming soon.
				</p>
			</div>
		</div>
	);
}
