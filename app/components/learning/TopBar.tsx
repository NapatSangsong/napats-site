/**
 * Top navigation bar for all learning pages.
 * "Napat • LEARNING" on the left, nav links + theme toggle on the right.
 */
import { Link, useLocation } from "react-router";
import type { ThemeTokens, ThemeMode } from "~/lib/theme";
import { Tracked, FilmDot, ThemeToggleIcon } from "./primitives";

interface TopBarProps {
	t: ThemeTokens;
	theme: ThemeMode;
	onToggleTheme: () => void;
}

export function TopBar({ t, theme, onToggleTheme }: TopBarProps) {
	const location = useLocation();

	const navItems = [
		{ label: "LIBRARY", href: "/learning/library" },
		{ label: "PROGRESS", href: "/learning/progress" },
		{ label: "SETTINGS", href: "/learning/settings" },
	];

	return (
		<nav
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "22px 0 18px",
				borderBottom: `1px solid ${t.divider}`,
			}}
		>
			{/* Logo */}
			<Link
				to="/learning"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					textDecoration: "none",
				}}
			>
				<span
					style={{
						fontFamily: "Playfair Display, serif",
						fontSize: 20,
						color: t.inkStrong,
						fontWeight: 500,
					}}
				>
					Napat
				</span>
				<FilmDot />
				<Tracked
					size={9}
					tracking={0.3}
					style={{
						color: t.inkGhost,
						marginLeft: 14,
						borderLeft: `1px solid ${t.divider}`,
						paddingLeft: 14,
					}}
				>
					LEARNING
				</Tracked>
			</Link>

			{/* Desktop nav */}
			<div className="hidden sm:flex" style={{ alignItems: "center", gap: 32 }}>
				{navItems.map((item) => {
					const active = location.pathname === item.href;
					return (
						<Link
							key={item.label}
							to={item.href}
							style={{ textDecoration: "none" }}
						>
							<Tracked
								size={10}
								tracking={0.25}
								style={{
									color: active ? t.ink : t.inkMuted,
									cursor: "pointer",
									transition: "color .3s",
								}}
							>
								{item.label}
							</Tracked>
						</Link>
					);
				})}
				<ThemeToggleIcon theme={theme} onClick={onToggleTheme} color={t.inkMuted} />
			</div>
		</nav>
	);
}
