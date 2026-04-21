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
		bgElevated: "#141414",
		bgCard: "rgba(255,255,255,0.04)",
		ink: "#e8e8e8",
		inkStrong: "#ffffff",
		inkMuted: "rgba(255,255,255,0.65)",
		inkGhost: "rgba(255,255,255,0.38)",
		inkFaint: "rgba(255,255,255,0.15)",
		divider: "rgba(255,255,255,0.10)",
		dividerStrong: "rgba(255,255,255,0.20)",
		accent: "#cc0000",
		accentSoft: "#7A1F26",
	},
	light: {
		bg: "#F5F3EF",
		bgElevated: "#EEEBE4",
		bgCard: "rgba(10,9,8,0.04)",
		ink: "#1a1a18",
		inkStrong: "#000000",
		inkMuted: "rgba(10,9,8,0.60)",
		inkGhost: "rgba(10,9,8,0.35)",
		inkFaint: "rgba(10,9,8,0.12)",
		divider: "rgba(10,9,8,0.12)",
		dividerStrong: "rgba(10,9,8,0.22)",
		accent: "#cc0000",
		accentSoft: "#E63946",
	},
};
