/**
 * Mobile bottom tab bar — shown only on small screens.
 */
import { Link, useLocation } from "react-router";
import type { ThemeTokens } from "~/lib/theme";
import { Tracked } from "./primitives";

interface MobileTabBarProps {
	t: ThemeTokens;
}

const tabs = [
	{ label: "HOME", href: "/learning", icon: "home" },
	{ label: "LIBRARY", href: "/learning/library", icon: "library" },
	{ label: "PROGRESS", href: "/learning/progress", icon: "progress" },
	{ label: "SETTINGS", href: "/learning/settings", icon: "settings" },
];

function TabIcon({ icon, color, size = 20 }: { icon: string; color: string; size?: number }) {
	const s = { width: size, height: size, display: "block" };
	switch (icon) {
		case "home":
			return (
				<svg style={s} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M3 8l7-5 7 5v8a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" />
					<path d="M8 17v-6h4v6" />
				</svg>
			);
		case "library":
			return (
				<svg style={s} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M3 4h2v14H3zM8 4h2v14H8zM13 4l4 14-2 .5L11 4.5z" />
				</svg>
			);
		case "progress":
			return (
				<svg style={s} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M4 16V10M8 16V6M12 16V8M16 16V4" />
				</svg>
			);
		case "settings":
			return (
				<svg style={s} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<circle cx="10" cy="10" r="3" />
					<path d="M10 2v2M10 16v2M3.5 5.5l1.4 1.4M15.1 15.1l1.4 1.4M2 10h2M16 10h2M3.5 14.5l1.4-1.4M15.1 4.9l1.4-1.4" />
				</svg>
			);
		default:
			return null;
	}
}

export function MobileTabBar({ t }: MobileTabBarProps) {
	const location = useLocation();

	return (
		<nav
			className="sm:hidden"
			style={{
				position: "fixed",
				bottom: 0,
				left: 0,
				right: 0,
				background: t.bg,
				borderTop: `1px solid ${t.divider}`,
				display: "flex",
				justifyContent: "space-around",
				padding: "16px 0 calc(16px + env(safe-area-inset-bottom, 0px))",
				zIndex: 50,
			}}
		>
			{tabs.map((tab) => {
				const active = location.pathname === tab.href;
				const color = active ? t.accent : t.inkGhost;
				return (
					<Link
						key={tab.label}
						to={tab.href}
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 4,
							textDecoration: "none",
						}}
					>
						<TabIcon icon={tab.icon} color={color} />
						<Tracked
							size={9}
							tracking={0.2}
							style={{
								color,
								fontWeight: active ? 600 : 400,
							}}
						>
							{tab.label}
						</Tracked>
					</Link>
				);
			})}
		</nav>
	);
}
