import { useCallback, useEffect, useState } from "react";
import { DARK, LIGHT, type ChartTheme } from "~/components/energy-dashboard/theme";

export type DashTheme = "dark" | "light";

const LS_KEY = "edash-theme";

export function useDashboardTheme(): {
	theme: DashTheme;
	toggle: () => void;
	chartTheme: ChartTheme;
} {
	// Default light on both server + first client render → no hydration mismatch.
	const [theme, setTheme] = useState<DashTheme>("light");

	// Reconcile from localStorage after mount (light-preferrers see sub-frame flip).
	useEffect(() => {
		const stored = localStorage.getItem(LS_KEY);
		if (stored === "light" || stored === "dark") setTheme(stored);
	}, []);

	const toggle = useCallback(() => {
		setTheme((prev) => {
			const next = prev === "dark" ? "light" : "dark";
			localStorage.setItem(LS_KEY, next);
			return next;
		});
	}, []);

	return { theme, toggle, chartTheme: theme === "dark" ? DARK : LIGHT };
}
