/**
 * Mobile bottom tab bar — shown only on small screens.
 */
import { Link, useLocation } from "react-router";
import type { ThemeTokens } from "~/lib/theme";
import { Tracked, FilmDot } from "./primitives";

interface MobileTabBarProps {
	t: ThemeTokens;
}

const tabs = [
	{ label: "HOME", href: "/learning", icon: "home" },
	{ label: "LIBRARY", href: "/learning/library", icon: "library" },
	{ label: "PROGRESS", href: "/learning/progress", icon: "progress" },
	{ label: "SETTINGS", href: "/learning/settings", icon: "settings" },
];

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
				padding: "12px 0 env(safe-area-inset-bottom, 8px)",
				zIndex: 50,
			}}
		>
			{tabs.map((tab) => {
				const active = location.pathname === tab.href;
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
						{active && <FilmDot size={4} />}
						<Tracked
							size={8}
							tracking={0.2}
							style={{
								color: active ? t.ink : t.inkGhost,
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
