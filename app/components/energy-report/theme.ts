/**
 * Chart theme for /energy/report. Fill colors are validated (dataviz skill
 * six-checks, both modes): #c9821a / #0f9c8d / #28a05c pass the lightness
 * band, chroma floor, CVD separation, and contrast on both surfaces. The
 * brighter site tokens (--sun #ffb454 …) are ACCENTS only (KPI bars, pulses),
 * never large chart fills.
 */
export interface RptTheme {
	/** on-peak fill (amber) */
	on: string;
	/** off-peak fill (teal) */
	off: string;
	/** solar fill (green) */
	solar: string;
	axis: string;
	grid: string;
	/** panel surface — also the 2px spacer stroke between stacked segments */
	surface: string;
	ink: string;
	inkDim: string;
	tooltipBg: string;
	tooltipText: string;
	refLine: string;
	good: string;
	bad: string;
}

export const RPT_DARK: RptTheme = {
	on: "#c9821a",
	off: "#0f9c8d",
	solar: "#28a05c",
	axis: "#8c9ac0",
	grid: "rgba(140, 154, 192, 0.16)",
	surface: "#141d36",
	ink: "#eef2ff",
	inkDim: "#9aa7cc",
	tooltipBg: "#1b2542",
	tooltipText: "#eef2ff",
	refLine: "#8c9ac0",
	good: "#5ae08f",
	bad: "#ff7a7a",
};

export const RPT_LIGHT: RptTheme = {
	on: "#c9821a",
	off: "#0f9c8d",
	solar: "#28a05c",
	axis: "#5b6785",
	grid: "rgba(91, 103, 133, 0.18)",
	surface: "#ffffff",
	ink: "#1a2238",
	inkDim: "#5b6785",
	tooltipBg: "#ffffff",
	tooltipText: "#1a2238",
	refLine: "#5b6785",
	good: "#1d9e57",
	bad: "#d64545",
};
