/**
 * Settings page — learning preferences, language, theme, and session.
 */
import { useState, useEffect, useCallback } from "react";
import type { Route } from "./+types/learning.settings";
import { useTheme } from "./learning";
import { TopBar } from "~/components/learning/TopBar";
import { Tracked, FilmDot, Rule, Chip, TrackedButton } from "~/components/learning/primitives";

// ── Types ──────────────────────────────────────────────────

interface LearningStyle {
	reading: boolean;
	watching: boolean;
	doing: boolean;
}

type Language = "en" | "th";

// ── Helpers ────────────────────────────────────────────────

async function loadSettings(): Promise<Record<string, unknown>> {
	try {
		const res = await fetch("/learning/api/settings", {
			headers: { Accept: "application/json" },
		});
		if (!res.ok) return {};
		return (await res.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}

async function saveSetting(key: string, value: unknown) {
	await fetch("/learning/api/settings", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ key, value }),
	});
}

// ── Meta ───────────────────────────────────────────────────

export function meta() {
	return [{ title: "Napat · Learning · Settings" }];
}

// ── Component ──────────────────────────────────────────────

export default function SettingsPage(_props: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();

	const [style, setStyle] = useState<LearningStyle>({
		reading: false,
		watching: false,
		doing: false,
	});
	const [language, setLanguage] = useState<Language>("en");
	const [loaded, setLoaded] = useState(false);

	// Load saved settings on mount
	useEffect(() => {
		loadSettings().then((s) => {
			if (s.learning_style) {
				const ls = s.learning_style as Partial<LearningStyle>;
				setStyle({
					reading: !!ls.reading,
					watching: !!ls.watching,
					doing: !!ls.doing,
				});
			}
			if (s.preferred_language) {
				setLanguage(s.preferred_language as Language);
			}
			setLoaded(true);
		});
	}, []);

	// Learning-style toggle
	const toggleStyle = useCallback(
		(key: keyof LearningStyle) => {
			setStyle((prev) => {
				const next = { ...prev, [key]: !prev[key] };
				saveSetting("learning_style", next);
				return next;
			});
		},
		[],
	);

	// Language toggle
	const pickLanguage = useCallback((lang: Language) => {
		setLanguage(lang);
		saveSetting("preferred_language", lang);
	}, []);

	// Section header helper
	const SectionLabel = ({ children }: { children: string }) => (
		<Tracked
			size={10}
			tracking={0.3}
			style={{ color: t.inkGhost, display: "block", marginBottom: 16 }}
		>
			{children}
		</Tracked>
	);

	return (
		<div style={{ padding: "0 20px 120px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />

			<div style={{ maxWidth: 920, margin: "0 auto", paddingTop: "14vh" }}>
				{/* ── Page title ─────────────────────────────── */}
				<Tracked
					size={10}
					tracking={0.3}
					style={{ color: t.inkGhost, display: "block", marginBottom: 24 }}
				>
					SETTINGS
				</Tracked>

				<h1
					style={{
						fontFamily: "Playfair Display, serif",
						fontSize: "clamp(32px, 7vw, 56px)",
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
					tailor the experience.
				</p>

				{/* ── Learning Style ────────────────────────── */}
				<div style={{ borderTop: `1px solid ${t.divider}`, padding: "32px 0" }}>
					<SectionLabel>LEARNING STYLE</SectionLabel>
					<p
						style={{
							fontFamily: "JetBrains Mono, monospace",
							fontSize: 11,
							color: t.inkMuted,
							letterSpacing: "0.04em",
							margin: "0 0 16px",
						}}
					>
						Select the formats you prefer. Multiple choices welcome.
					</p>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<Chip t={t} active={style.reading} onClick={() => toggleStyle("reading")}>
							{style.reading ? "\u25CF " : "\u25CB "}Reading
						</Chip>
						<Chip t={t} active={style.doing} onClick={() => toggleStyle("doing")}>
							{style.doing ? "\u25CF " : "\u25CB "}Hands-on
						</Chip>
						<Chip t={t} active={style.watching} onClick={() => toggleStyle("watching")}>
							{style.watching ? "\u25CF " : "\u25CB "}Visual
						</Chip>
					</div>
				</div>

				{/* ── Language Preference ───────────────────── */}
				<div style={{ borderTop: `1px solid ${t.divider}`, padding: "32px 0" }}>
					<SectionLabel>LANGUAGE</SectionLabel>
					<p
						style={{
							fontFamily: "JetBrains Mono, monospace",
							fontSize: 11,
							color: t.inkMuted,
							letterSpacing: "0.04em",
							margin: "0 0 16px",
						}}
					>
						Choose your preferred language for content.
					</p>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<Chip
							t={t}
							active={language === "en"}
							onClick={() => pickLanguage("en")}
						>
							{language === "en" ? "\u25CF " : "\u25CB "}English
						</Chip>
						<Chip
							t={t}
							active={language === "th"}
							onClick={() => pickLanguage("th")}
						>
							{language === "th" ? "\u25CF " : "\u25CB "}\u0E44\u0E17\u0E22
						</Chip>
					</div>
				</div>

				{/* ── Appearance ────────────────────────────── */}
				<div style={{ borderTop: `1px solid ${t.divider}`, padding: "32px 0" }}>
					<SectionLabel>APPEARANCE</SectionLabel>
					<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
						<Tracked size={10} tracking={0.25} style={{ color: t.inkMuted }}>
							THEME
						</Tracked>
						<Rule width={24} color={t.divider} />
						<TrackedButton t={t} onClick={toggleTheme}>
							{theme === "dark" ? "SWITCH TO LIGHT" : "SWITCH TO DARK"}
						</TrackedButton>
					</div>
					<p
						style={{
							fontFamily: "JetBrains Mono, monospace",
							fontSize: 11,
							color: t.inkGhost,
							letterSpacing: "0.04em",
							marginTop: 12,
							marginBottom: 0,
						}}
					>
						Currently using {theme} mode.
					</p>
				</div>

				{/* ── Danger Zone ───────────────────────────── */}
				<div style={{ borderTop: `1px solid ${t.divider}`, padding: "32px 0" }}>
					<SectionLabel>DANGER ZONE</SectionLabel>
					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						<FilmDot size={6} style={{ opacity: 0.4 }} />
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
					<p
						style={{
							fontFamily: "JetBrains Mono, monospace",
							fontSize: 11,
							color: t.inkGhost,
							letterSpacing: "0.04em",
							marginTop: 12,
							marginBottom: 0,
						}}
					>
						Ends your current session. You will need to re-authenticate.
					</p>
				</div>
			</div>
		</div>
	);
}
