export interface ChartTheme {
	load: string;
	solar: string;
	peak: string;
	off: string;
	good: string;
	bad: string;
	grid: string;
	axis: string;
	tooltipBg: string;
	tooltipBorder: string;
	tooltipText: string;
	actual: string;
	forecast: string;
	flat: string;
	tou: string;
	tou2: string;
	tou4: string;
	batt: string;
}

export const DARK: ChartTheme = {
	load: "#3dd6c3",
	solar: "#ffb454",
	peak: "#ff6a5e",
	off: "#3dd6c3",
	good: "#5ae08f",
	bad: "#ff6a5e",
	grid: "#2c3a60",
	axis: "#8c9ac0",
	tooltipBg: "#1a2440",
	tooltipBorder: "#2c3a60",
	tooltipText: "#e8edf7",
	actual: "#3dd6c3",
	forecast: "#4a5a80",
	flat: "#8c9ac0",
	tou: "#3dd6c3",
	tou2: "#ffb454",
	tou4: "#5ae08f",
	batt: "#a78bfa",
};

export const LIGHT: ChartTheme = {
	load: "#1fa897",
	solar: "#d8821e",
	peak: "#d9483b",
	off: "#1fa897",
	good: "#2f9e63",
	bad: "#d9483b",
	grid: "#dfe5f0",
	axis: "#5a6b8c",
	tooltipBg: "#ffffff",
	tooltipBorder: "#dfe5f0",
	tooltipText: "#1a2238",
	actual: "#1fa897",
	forecast: "#a0aec0",
	flat: "#94a3b8",
	tou: "#1fa897",
	tou2: "#d8821e",
	tou4: "#2f9e63",
	batt: "#7c3aed",
};
