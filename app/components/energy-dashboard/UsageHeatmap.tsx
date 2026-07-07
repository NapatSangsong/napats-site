import { useMemo, useState } from "react";
import type { Analysis } from "~/lib/energy-calc";
import { weekdayOf } from "~/lib/energy-calc";
import { dayOnly, dayMonth } from "~/lib/energy-format";
import type { ChartTheme } from "./theme";
import { Panel } from "./Panel";

interface Props {
	a: Analysis;
	ct: ChartTheme;
}

export function UsageHeatmap({ a, ct }: Props) {
	const [tooltip, setTooltip] = useState<{ label: string; kwh: number; x: number; y: number } | null>(null);

	const { rows, maxVal } = useMemo(() => {
		const days = [...a.daily.keys()].sort((x, y) => x - y);
		const maxVal = Math.max(...[...a.dh.values()]);
		return { rows: days, maxVal };
	}, [a]);

	const cellColor = (kwh: number, isWeekend: boolean): string => {
		if (kwh <= 0) return "transparent";
		const t = kwh / maxVal;
		if (t > 0.8) return ct.peak;
		if (t > 0.5) return ct.solar;
		return ct.load;
	};

	const HOURS = Array.from({ length: 24 }, (_, i) => i);

	return (
		<Panel title={`Usage Heatmap — Day × Hour (${rows.length} days)`}>
			<div className="edash-panel-body" style={{ position: "relative" }}>
				{/* hour labels */}
				<div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
					<div style={{ width: 36, flexShrink: 0 }} />
					{HOURS.map((h) => (
						<div
							key={h}
							className="edash-heatmap-axis"
							style={{
								flex: 1,
								minWidth: 0,
								textAlign: "center",
								opacity: h % 3 === 0 ? 1 : 0,
							}}
						>
							{h}
						</div>
					))}
				</div>
				{rows.map((day) => {
					const wd = weekdayOf(day);
					const isWeekend = wd >= 5;
					return (
						<div key={day} style={{ display: "flex", gap: 2, alignItems: "center", marginBottom: 2 }}>
							<div
								className="edash-heatmap-axis"
								style={{ width: 34, flexShrink: 0, textAlign: "right", paddingRight: 4, opacity: 0.8 }}
							>
								{dayOnly(day)}
							</div>
							{HOURS.map((h) => {
								const kwh = a.dh.get(day * 24 + h) ?? 0;
								const t = maxVal > 0 ? kwh / maxVal : 0;
								return (
									<div
										key={h}
										className="edash-heatmap-cell"
										style={{
											flex: 1,
											minWidth: 0,
											background: cellColor(kwh, isWeekend),
											opacity: kwh > 0 ? 0.3 + t * 0.7 : 0.08,
											outline: isWeekend ? `1px solid ${ct.off}22` : "none",
										}}
										onMouseEnter={(e) => {
											const rect = e.currentTarget.getBoundingClientRect();
											setTooltip({
												label: `${dayMonth(day)} ${String(h).padStart(2, "0")}:00`,
												kwh,
												x: rect.left + rect.width / 2,
												y: rect.top,
											});
										}}
										onMouseLeave={() => setTooltip(null)}
									/>
								);
							})}
						</div>
					);
				})}
				{tooltip && (
					<div
						style={{
							position: "fixed",
							left: tooltip.x,
							top: tooltip.y - 8,
							transform: "translate(-50%, -100%)",
							pointerEvents: "none",
							zIndex: 50,
						}}
					>
						<div className="edash-tooltip">
							<div className="edash-tooltip-label">{tooltip.label}</div>
							<div>{tooltip.kwh.toFixed(3)} kWh</div>
						</div>
					</div>
				)}
				{/* legend */}
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: "0.7rem", color: "var(--ink-faint)" }}>
					<span>Low</span>
					{[0.2, 0.4, 0.6, 0.8, 1.0].map((t) => (
						<div
							key={t}
							style={{
								width: 14,
								height: 14,
								borderRadius: 2,
								background: t > 0.8 ? ct.peak : t > 0.5 ? ct.solar : ct.load,
								opacity: 0.3 + t * 0.7,
							}}
						/>
					))}
					<span>High</span>
					<span style={{ marginLeft: 8, opacity: 0.5 }}>Weekend = outlined</span>
				</div>
			</div>
		</Panel>
	);
}
