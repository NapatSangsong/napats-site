/** Design tokens for the learning platform — dark (canonical) and light (warm paper). */

export interface ThemeTokens {
	bg: string;
	bgElevated: string;
	bgCard: string;
	ink: string;
	inkStrong: string;
	inkMuted: string;
	inkGhost: string;
	inkFaint: string;
	divider: string;
	dividerStrong: string;
	accent: string;
	accentSoft: string;
}

export type ThemeMode = "dark" | "light";

export const tokens: Record<ThemeMode, ThemeTokens> = {
	dark: {
		bg: "#0a0a0a",
		bgElevated: "#0f0f0f",
		bgCard: "rgba(255,255,255,0.02)",
		ink: "#e5e5e5",
		inkStrong: "#ffffff",
		inkMuted: "rgba(255,255,255,0.5)",
		inkGhost: "rgba(255,255,255,0.20)",
		inkFaint: "rgba(255,255,255,0.10)",
		divider: "rgba(255,255,255,0.06)",
		dividerStrong: "rgba(255,255,255,0.12)",
		accent: "#cc0000",
		accentSoft: "#7A1F26",
	},
	light: {
		bg: "#F5F3EF",
		bgElevated: "#EEEBE4",
		bgCard: "rgba(10,9,8,0.03)",
		ink: "#0A0908",
		inkStrong: "#000000",
		inkMuted: "rgba(10,9,8,0.55)",
		inkGhost: "rgba(10,9,8,0.20)",
		inkFaint: "rgba(10,9,8,0.10)",
		divider: "rgba(10,9,8,0.10)",
		dividerStrong: "rgba(10,9,8,0.18)",
		accent: "#cc0000",
		accentSoft: "#E63946",
	},
};
