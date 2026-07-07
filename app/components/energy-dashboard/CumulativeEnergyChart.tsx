import {
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	ReferenceLine,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { TooltipPayload } from "recharts";
import { useMemo } from "react";
import type { Analysis } from "~/lib/energy-calc";
import { weekdayOf, hourOf, dayNum } from "~/lib/energy-calc";
import { dayMonth, f2 } from "~/lib/energy-format";
import type { ChartTheme } from "./theme";
import { ChartFrame } from "./ChartFrame";
import { Panel } from "./Panel";

interface Props {
	a: Analysis;
	ct: ChartTheme;
}

const DAY_COLORS = [
	{ opacity: 1.0, width: 2.5 },  // today
	{ opacity: 0.85, width: 2 },   // yesterday
	{ opacity: 0.6, width: 1.5 },  // 2 days ago
	{ opacity: 0.4, width: 1.5 },  // 3 days ago
	{ opacity: 0.25, width: 1 },   // 4 days ago
];

// Assign a distinct hue per day slot so lines are easy to tell apart
function dayColor(ct: ChartTheme, i: number): string {
	return [ct.load, ct.solar, ct.peak, ct.batt, ct.good][i] ?? ct.axis;
}

function CustomTooltip({
	active,
	payload,
	label,
	ct,
	currentHour,
}: {
	active?: boolean;
	payload?: TooltipPayload;
	label?: string | number;
	ct: ChartTheme;
	currentHour: number;
}) {
	if (!active || !payload?.length) return null;
	const h = Number(label);

	// today vs yesterday delta
	const today = payload.find((p) => String(p.name).startsWith("วันนี้"))?.value;
	const yesterday = payload.find((p) => String(p.name).startsWith("เมื่อวาน"))?.value;
	const delta = today != null && yesterday != null ? Number(today) - Number(yesterday) : null;

	return (
		<div className="edash-tooltip" style={{ ["--tooltipBg" as string]: ct.tooltipBg }}>
			<div className="edash-tooltip-label">
				{String(h).padStart(2, "0")}:00{h === currentHour ? " ← ตอนนี้" : ""}
			</div>
			{payload.map((p) => (
				<div key={p.name} className="edash-tooltip-row">
					<span className="edash-tooltip-dot" style={{ background: p.stroke ?? p.color }} />
					<span style={{ color: ct.tooltipText }}>
						{p.name}: <strong>{f2(Number(p.value))} kWh</strong>
					</span>
				</div>
			))}
			{delta != null && (
				<div
					style={{
						marginTop: 6,
						paddingTop: 6,
						borderTop: `1px solid ${ct.grid}`,
						fontSize: "0.72rem",
						color: delta >= 0 ? ct.bad : ct.good,
						fontWeight: 700,
					}}
				>
					วันนี้ {delta >= 0 ? "+" : ""}{f2(delta)} kWh vs เมื่อวาน
				</div>
			)}
		</div>
	);
}

export function CumulativeEnergyChart({ a, ct }: Props) {
	const { chartData, days, currentHour, avgSeries } = useMemo(() => {
		// Last 5 calendar days with data, most recent first
		const allDays = [...a.daily.keys()].sort((x, y) => y - x);
		const days = allDays.slice(0, 5);

		const nowDay = dayNum(a.t1);
		const currentHour = hourOf(a.t1);

		// Build cumulative series per day: cumKwh[day][h] = Σ dh[day*24+0..h]
		const cumByDay = new Map<number, (number | null)[]>();
		for (const day of days) {
			const cum: (number | null)[] = [];
			let running = 0;
			for (let h = 0; h < 24; h++) {
				const kwh = a.dh.get(day * 24 + h);
				if (kwh != null) running += kwh;
				// For today, stop at current hour (no future data)
				if (day === nowDay && h > currentHour) {
					cum.push(null);
				} else if (!a.dayHours.get(day)?.has(h) && kwh == null) {
					// Hour has no data at all (gap or very early/late) — carry forward
					cum.push(running > 0 ? running : null);
				} else {
					cum.push(running);
				}
			}
			cumByDay.set(day, cum);
		}

		// 7-day average cumulative (all available complete days)
		const completeDays = [...a.daily.keys()].filter(
			(d) => (a.dayHours.get(d)?.size ?? 0) >= 20,
		);
		const avgCum: (number | null)[] = Array(24).fill(null);
		if (completeDays.length >= 2) {
			for (let h = 0; h < 24; h++) {
				let sum = 0;
				let count = 0;
				for (const day of completeDays) {
					const cum = cumByDay.get(day);
					const val = cum ? cum[h] : null;
					if (val != null) { sum += val; count++; }
					else {
						// Recompute for days not in top-5
						let r = 0;
						for (let hh = 0; hh <= h; hh++) r += a.dh.get(day * 24 + hh) ?? 0;
						if (r > 0) { sum += r; count++; }
					}
				}
				avgCum[h] = count >= 2 ? sum / count : null;
			}
		}

		// Merge into chart rows (one row per hour)
		const chartData = Array.from({ length: 24 }, (_, h) => {
			const row: Record<string, number | null> = { h };
			for (const day of days) {
				row[String(day)] = cumByDay.get(day)?.[h] ?? null;
			}
			row["avg"] = avgCum[h];
			return row;
		});

		return { chartData, days, currentHour, avgSeries: completeDays.length >= 2 };
	}, [a]);

	// Label helpers
	const todayDay = days[0];
	const dayLabel = (day: number, i: number): string => {
		if (i === 0) return `วันนี้ (${dayMonth(day)})`;
		if (i === 1) return `เมื่อวาน (${dayMonth(day)})`;
		return dayMonth(day);
	};

	// Stats for header
	const todayCum = todayDay
		? (chartData[currentHour]?.[String(todayDay)] as number | null) ?? 0
		: 0;
	const yesterdayCum =
		days[1] != null
			? (chartData[currentHour]?.[String(days[1])] as number | null) ?? 0
			: null;
	const deltaNow =
		yesterdayCum != null ? todayCum - yesterdayCum : null;

	return (
		<Panel
			title="พลังงานสะสม (Forward Energy) — ย้อนหลัง 5 วัน"
			legend={[
				...days.map((day, i) => ({
					color: dayColor(ct, i),
					label: dayLabel(day, i),
					...(i >= 2 ? { dash: false } : {}),
				})),
				...(avgSeries ? [{ color: ct.axis, label: "เฉลี่ย (complete days)", dash: true }] : []),
			]}
		>
			<div className="edash-panel-body">
				{/* summary stats */}
				<div
					style={{
						display: "flex",
						gap: 20,
						marginBottom: 12,
						fontSize: "0.78rem",
						flexWrap: "wrap",
						alignItems: "center",
					}}
				>
					<span style={{ color: "var(--ink-dim)" }}>
						วันนี้ถึงตอนนี้{" "}
						<span
							className="edash-mono"
							style={{ color: dayColor(ct, 0), fontWeight: 700 }}
						>
							{f2(todayCum)} kWh
						</span>
					</span>
					{yesterdayCum != null && (
						<span style={{ color: "var(--ink-dim)" }}>
							เมื่อวานเวลาเดียวกัน{" "}
							<span
								className="edash-mono"
								style={{ color: dayColor(ct, 1), fontWeight: 700 }}
							>
								{f2(yesterdayCum)} kWh
							</span>
						</span>
					)}
					{deltaNow != null && (
						<span
							className="edash-mono"
							style={{
								fontWeight: 700,
								padding: "2px 10px",
								borderRadius: 8,
								fontSize: "0.78rem",
								background:
									deltaNow > 0
										? "rgba(255,106,94,0.15)"
										: "rgba(90,224,143,0.15)",
								color: deltaNow > 0 ? ct.bad : ct.good,
							}}
						>
							{deltaNow > 0 ? "+" : ""}
							{f2(deltaNow)} kWh {deltaNow > 0 ? "▲ มากกว่า" : "▼ น้อยกว่า"}เมื่อวาน
						</span>
					)}
					{days[0] != null && (
						<span style={{ color: "var(--ink-faint)", fontSize: "0.72rem" }}>
							ณ {String(currentHour).padStart(2, "0")}:00 BKK
						</span>
					)}
				</div>

				<ChartFrame size="tall">
					<ComposedChart
						data={chartData}
						margin={{ top: 4, right: 16, bottom: 0, left: -4 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke={ct.grid}
							vertical={false}
						/>
						<XAxis
							dataKey="h"
							tickFormatter={(h) =>
								h % 6 === 0 ? `${String(h).padStart(2, "0")}:00` : ""
							}
							tick={{ fill: ct.axis, fontSize: 11 }}
							axisLine={{ stroke: ct.grid }}
							tickLine={false}
						/>
						<YAxis
							tick={{ fill: ct.axis, fontSize: 11 }}
							axisLine={false}
							tickLine={false}
							tickFormatter={(v) => `${v.toFixed(1)}`}
							width={36}
							unit=" kWh"
						/>
						<Tooltip
							content={(p) => (
								<CustomTooltip {...p} ct={ct} currentHour={currentHour} />
							)}
						/>

						{/* current hour marker */}
						<ReferenceLine
							x={currentHour}
							stroke={ct.solar}
							strokeDasharray="5 3"
							strokeOpacity={0.6}
							label={{
								value: "ตอนนี้",
								fill: ct.solar,
								fontSize: 10,
								position: "top",
							}}
						/>

						{/* 7-day average */}
						{avgSeries && (
							<Line
								type="monotone"
								dataKey="avg"
								name="เฉลี่ย"
								stroke={ct.axis}
								strokeWidth={1.5}
								strokeDasharray="6 4"
								dot={false}
								connectNulls
								activeDot={false}
							/>
						)}

						{/* one line per day, today first (on top) */}
						{[...days].reverse().map((day, revIdx) => {
							const i = days.length - 1 - revIdx;
							const style = DAY_COLORS[i] ?? DAY_COLORS[DAY_COLORS.length - 1];
							return (
								<Line
									key={day}
									type="monotone"
									dataKey={String(day)}
									name={dayLabel(day, i)}
									stroke={dayColor(ct, i)}
									strokeWidth={style.width}
									strokeOpacity={style.opacity}
									dot={false}
									connectNulls
									activeDot={i === 0 ? { r: 5, fill: dayColor(ct, 0) } : { r: 3 }}
								/>
							);
						})}
					</ComposedChart>
				</ChartFrame>
			</div>
		</Panel>
	);
}
