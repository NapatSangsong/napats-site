import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	ReferenceArea,
	ReferenceLine,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { TooltipPayload } from "recharts";
import { useMemo, useState } from "react";
import { dayNum, hourOf } from "~/lib/energy-calc";
import type { Analysis } from "~/lib/energy-calc";
import type { ChartTheme } from "./theme";
import { ChartFrame } from "./ChartFrame";
import { Panel } from "./Panel";

interface Props {
	prof: number[];
	sol: number[];
	a: Analysis;
	ct: ChartTheme;
}

function CustomTooltip({ active, payload, label, ct }: { active?: boolean; payload?: TooltipPayload; label?: string | number; ct: ChartTheme }) {
	if (!active || !payload?.length) return null;
	return (
		<div className="edash-tooltip" style={{ ["--tooltipBg" as string]: ct.tooltipBg }}>
			<div className="edash-tooltip-label">{`${label}:00`}</div>
			{payload.map((p) => (
				<div key={p.name} className="edash-tooltip-row">
					<span className="edash-tooltip-dot" style={{ background: p.color }} />
					<span style={{ color: ct.tooltipText }}>{p.name}: {Number(p.value).toFixed(3)} kWh</span>
				</div>
			))}
		</div>
	);
}

type SeriesKey = "load" | "solar" | "today" | "yesterday" | "weekAgo";

export function LoadVsSolarChart({ prof, sol, a, ct }: Props) {
	const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

	const { data, currentHour, hasYesterday, hasWeekAgo } = useMemo(() => {
		const todayDay = dayNum(a.t1);
		const currentHour = hourOf(a.t1);
		const yestDay = todayDay - 1;
		const weekAgoDay = todayDay - 7;
		const hasYesterday = a.daily.has(yestDay);
		const hasWeekAgo = a.daily.has(weekAgoDay);
		const data = prof.map((load, h) => ({
			h,
			load,
			solar: (sol[h] ?? 0) * 2,
			today: h <= currentHour ? (a.dh.get(todayDay * 24 + h) ?? null) : null,
			yesterday: hasYesterday ? (a.dh.get(yestDay * 24 + h) ?? null) : undefined,
			weekAgo: hasWeekAgo ? (a.dh.get(weekAgoDay * 24 + h) ?? null) : undefined,
		}));
		return { data, currentHour, hasYesterday, hasWeekAgo };
	}, [prof, sol, a]);

	const toggle = (key: SeriesKey) =>
		setHidden((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});

	const show = (key: SeriesKey) => !hidden.has(key);

	const series: { key: SeriesKey; color: string; label: string; available?: boolean }[] = [
		{ key: "load", color: ct.load, label: "Load (avg)" },
		{ key: "solar", color: ct.solar, label: "Solar 4kW" },
		{ key: "today", color: ct.batt, label: "วันนี้จริง" },
		{ key: "yesterday", color: ct.peak, label: "เมื่อวาน", available: hasYesterday },
		{ key: "weekAgo", color: ct.good, label: "สัปดาห์ก่อน", available: hasWeekAgo },
	];

	return (
		<Panel title="Load vs Solar — 24h">
			{/* Toggle pills */}
			<div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
				{series.map(({ key, color, label, available }) => {
					if (available === false) return null;
					const active = show(key);
					return (
						<button
							key={key}
							type="button"
							onClick={() => toggle(key)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 5,
								padding: "2px 8px",
								borderRadius: 999,
								border: `1.5px solid ${color}`,
								background: active ? color + "28" : "transparent",
								color: active ? color : "var(--axis, #8C9AC0)",
								fontSize: 11,
								cursor: "pointer",
								opacity: active ? 1 : 0.45,
								transition: "opacity .15s, background .15s",
							}}
						>
							<span style={{ width: 10, height: 2, background: active ? color : "currentColor", display: "inline-block", borderRadius: 1 }} />
							{label}
						</button>
					);
				})}
			</div>
			<ChartFrame>
				<ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
					<defs>
						<linearGradient id="lvsLoad" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={ct.load} stopOpacity={0.3} />
							<stop offset="100%" stopColor={ct.load} stopOpacity={0.02} />
						</linearGradient>
					</defs>
					{/* TOU zones */}
					<ReferenceArea x1={0} x2={8} className="edash-zone-night" fill={ct.grid} fillOpacity={0.25} />
					<ReferenceArea x1={9} x2={16} fill={ct.solar} fillOpacity={0.07} />
					<ReferenceArea x1={17} x2={21} fill={ct.peak} fillOpacity={0.1} />
					<ReferenceArea x1={22} x2={23} fill={ct.grid} fillOpacity={0.25} />
					<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
					<XAxis
						dataKey="h"
						tickFormatter={(h) => h % 6 === 0 ? `${h}:00` : ""}
						tick={{ fill: ct.axis, fontSize: 11 }}
						axisLine={{ stroke: ct.grid }}
						tickLine={false}
					/>
					<YAxis
						tick={{ fill: ct.axis, fontSize: 11 }}
						axisLine={false}
						tickLine={false}
						tickFormatter={(v) => v.toFixed(2)}
						width={40}
					/>
					<Tooltip content={(p) => <CustomTooltip {...p} ct={ct} />} />
					<Area
						type="monotone"
						dataKey="load"
						name="Load"
						stroke={ct.load}
						strokeWidth={2}
						fill="url(#lvsLoad)"
						dot={false}
						hide={!show("load")}
						activeDot={{ r: 4, fill: ct.load }}
					/>
					<Line
						type="monotone"
						dataKey="solar"
						name="Solar"
						stroke={ct.solar}
						strokeWidth={2}
						strokeDasharray="6 4"
						dot={false}
						hide={!show("solar")}
						activeDot={{ r: 4, fill: ct.solar }}
					/>
					<Line
						type="monotone"
						dataKey="today"
						name="Today"
						stroke={ct.batt}
						strokeWidth={2.5}
						dot={false}
						connectNulls={false}
						hide={!show("today")}
						activeDot={{ r: 4, fill: ct.batt }}
					/>
					{hasYesterday && (
						<Line
							type="monotone"
							dataKey="yesterday"
							name="เมื่อวาน"
							stroke={ct.peak}
							strokeWidth={1.5}
							strokeDasharray="4 3"
							strokeOpacity={0.65}
							dot={false}
							connectNulls
							hide={!show("yesterday")}
							activeDot={{ r: 3, fill: ct.peak }}
						/>
					)}
					{hasWeekAgo && (
						<Line
							type="monotone"
							dataKey="weekAgo"
							name="สัปดาห์ก่อน"
							stroke={ct.good}
							strokeWidth={1.5}
							strokeDasharray="6 4"
							dot={false}
							connectNulls
							hide={!show("weekAgo")}
							activeDot={{ r: 3, fill: ct.good }}
						/>
					)}
					<ReferenceLine x={9} stroke={ct.grid} strokeDasharray="4 4" />
					<ReferenceLine x={17} stroke={ct.peak} strokeDasharray="4 4" strokeOpacity={0.5} />
					<ReferenceLine x={22} stroke={ct.grid} strokeDasharray="4 4" />
					<ReferenceLine
						x={currentHour}
						stroke={ct.batt}
						strokeDasharray="4 4"
						strokeOpacity={0.4}
					/>
				</ComposedChart>
			</ChartFrame>
		</Panel>
	);
}
