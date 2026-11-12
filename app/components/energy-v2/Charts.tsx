import { useEffect, useState } from "react";
import {
	Area,
	Bar,
	CartesianGrid,
	ComposedChart,
	Line,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { ChartPoint, EnergyView } from "~/lib/energy-model.server";
import { hhmm, hourLabel, n1, n2, thShort } from "./format";

/** Chart colours resolved from the page's CSS tokens (SVG attributes can't take var()). */
export interface ChartColors {
	solar: string;
	home: string;
	import: string;
	export: string;
	grid: string;
	axis: string;
	muted: string;
	ink2: string;
	card: string;
}

const TOKENS: Record<keyof ChartColors, string> = {
	solar: "--c-solar",
	home: "--c-home",
	import: "--c-import",
	export: "--c-export",
	grid: "--c-grid",
	axis: "--c-axis",
	muted: "--muted",
	ink2: "--ink-2",
	card: "--card",
};

export function useChartColors(root: React.RefObject<HTMLElement | null>): ChartColors | null {
	const [colors, setColors] = useState<ChartColors | null>(null);
	useEffect(() => {
		const read = () => {
			if (!root.current) return;
			const cs = getComputedStyle(root.current);
			const out = {} as ChartColors;
			for (const [k, v] of Object.entries(TOKENS)) out[k as keyof ChartColors] = cs.getPropertyValue(v).trim();
			setColors(out);
		};
		read();
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		mq.addEventListener("change", read);
		return () => mq.removeEventListener("change", read);
	}, [root]);
	return colors;
}

const AXIS_TICK = (c: ChartColors) => ({ fill: c.muted, fontSize: 11 });

function TipBox({ title, rows }: { title: string; rows: { key: string; color: string; label: string; value: string; dashed?: boolean }[] }) {
	return (
		<div className="ev-tip">
			<div className="ev-tip-title">{title}</div>
			{rows.map((r) => (
				<div className="ev-tip-row" key={r.key}>
					<span className={`ev-key ${r.dashed ? "dashed" : ""}`} style={{ borderColor: r.color, background: r.dashed ? "transparent" : r.color }} />
					<span className="ev-tip-label">{r.label}</span>
					<span className="ev-tip-val">{r.value}</span>
				</div>
			))}
		</div>
	);
}

// ---------------- today: measured + forecast ----------------

interface TodayRow {
	t: number;
	solarA: number | null;
	loadA: number | null;
	solarF: number | null;
	loadF: number | null;
}

export function TodayChart({ points, nowT, dayStartT, c }: { points: ChartPoint[]; nowT: number; dayStartT: number; c: ChartColors }) {
	// the bucket where measurement ends appears in both series so the lines join up
	const lastActual = points.filter((p) => !p.est).at(-1)?.t ?? -1;
	const rows: TodayRow[] = points.map((p) => ({
		t: p.t + 7.5 * 60_000, // plot at the bucket's midpoint
		solarA: !p.est ? p.solar : null,
		loadA: !p.est ? p.load : null,
		solarF: p.est || p.t === lastActual ? p.solar : null,
		loadF: p.est || p.t === lastActual ? p.load : null,
	}));
	const ticks = [0, 6, 12, 18, 24].map((h) => dayStartT + h * 3600_000);

	return (
		<ResponsiveContainer width="100%" height="100%">
			<ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
				<CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
				<XAxis
					dataKey="t"
					type="number"
					domain={[dayStartT, dayStartT + 24 * 3600_000]}
					ticks={ticks}
					tickFormatter={(v: number) => (v === ticks[4] ? "24:00" : hourLabel(v))}
					tick={AXIS_TICK(c)}
					axisLine={{ stroke: c.axis }}
					tickLine={false}
					interval="preserveStartEnd"
				/>
				<YAxis tick={AXIS_TICK(c)} axisLine={false} tickLine={false} width={36} />
				<Tooltip
					cursor={{ stroke: c.axis, strokeWidth: 1 }}
					content={({ active, payload, label }) => {
						if (!active || !payload?.length) return null;
						const r = payload[0].payload as TodayRow;
						const est = r.solarA === null;
						return (
							<TipBox
								title={`${hhmm(Number(label) - 7.5 * 60_000)}${est ? " · คาดการณ์" : ""}`}
								rows={[
									{ key: "s", color: c.solar, label: "โซลาร์", value: `${n2(est ? (r.solarF ?? 0) : (r.solarA ?? 0))} kW`, dashed: est },
									{ key: "l", color: c.home, label: "บ้านใช้", value: `${n2(est ? (r.loadF ?? 0) : (r.loadA ?? 0))} kW`, dashed: est },
								]}
							/>
						);
					}}
				/>
				<Area type="monotone" dataKey="solarA" stroke={c.solar} strokeWidth={2} fill={c.solar} fillOpacity={0.16} connectNulls={false} isAnimationActive={false} dot={false} activeDot={{ r: 4, stroke: c.card, strokeWidth: 2 }} />
				<Area type="monotone" dataKey="solarF" stroke={c.solar} strokeWidth={2} strokeDasharray="5 4" fill={c.solar} fillOpacity={0.06} connectNulls={false} isAnimationActive={false} dot={false} activeDot={{ r: 4, stroke: c.card, strokeWidth: 2 }} />
				<Line type="monotone" dataKey="loadA" stroke={c.home} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} activeDot={{ r: 4, stroke: c.card, strokeWidth: 2 }} />
				<Line type="monotone" dataKey="loadF" stroke={c.home} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} isAnimationActive={false} activeDot={{ r: 4, stroke: c.card, strokeWidth: 2 }} />
				<ReferenceLine x={nowT} stroke={c.ink2} strokeWidth={1} label={{ value: "ตอนนี้", position: "insideTopRight", fill: c.ink2, fontSize: 11 }} />
			</ComposedChart>
		</ResponsiveContainer>
	);
}

// ---------------- history: last 30 days ----------------

export function HistoryChart({ daily, c }: { daily: EnergyView["history"]["daily"]; c: ChartColors }) {
	const rows = daily.map((d) => ({
		date: d.date,
		self: Math.max(0, d.solar - d.gridSold),
		bought: d.gridPurchased,
		total: d.consumption,
		solar: d.solar,
	}));
	return (
		<ResponsiveContainer width="100%" height="100%">
			<ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap="22%">
				<CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
				<XAxis
					dataKey="date"
					tick={AXIS_TICK(c)}
					axisLine={{ stroke: c.axis }}
					tickLine={false}
					tickFormatter={(d: string) => thShort(d)}
					interval="preserveStartEnd"
					minTickGap={24}
				/>
				<YAxis tick={AXIS_TICK(c)} axisLine={false} tickLine={false} width={36} />
				<Tooltip
					cursor={{ fill: c.grid, fillOpacity: 0.5 }}
					content={({ active, payload }) => {
						if (!active || !payload?.length) return null;
						const r = payload[0].payload as (typeof rows)[number];
						return (
							<TipBox
								title={`${thShort(r.date)} · ใช้ ${n1(r.total)} kWh`}
								rows={[
									{ key: "b", color: c.import, label: "ซื้อจากการไฟฟ้า", value: `${n1(r.bought)} kWh` },
									{ key: "s", color: c.solar, label: "โซลาร์ใช้เอง", value: `${n1(r.self)} kWh` },
								]}
							/>
						);
					}}
				/>
				<Bar dataKey="self" stackId="u" fill={c.solar} stroke={c.card} strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
				<Bar dataKey="bought" stackId="u" fill={c.import} stroke={c.card} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
			</ComposedChart>
		</ResponsiveContainer>
	);
}

// ---------------- model accuracy: leave-one-day-out backtest ----------------

export function BacktestChart({ backtest, c }: { backtest: EnergyView["model"]["backtest"]; c: ChartColors }) {
	return (
		<ResponsiveContainer width="100%" height="100%">
			<ComposedChart data={backtest} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap="30%">
				<CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
				<XAxis dataKey="date" tick={AXIS_TICK(c)} axisLine={{ stroke: c.axis }} tickLine={false} tickFormatter={(d: string) => thShort(d)} minTickGap={20} />
				<YAxis tick={AXIS_TICK(c)} axisLine={false} tickLine={false} width={36} />
				<Tooltip
					cursor={{ fill: c.grid, fillOpacity: 0.5 }}
					content={({ active, payload }) => {
						if (!active || !payload?.length) return null;
						const r = payload[0].payload as EnergyView["model"]["backtest"][number];
						const err = ((r.predictedKwh - r.actualKwh) / r.actualKwh) * 100;
						return (
							<TipBox
								title={`${thShort(r.date)} · คลาด ${err >= 0 ? "+" : ""}${Math.round(err)}%`}
								rows={[
									{ key: "a", color: c.solar, label: "ผลิตจริง", value: `${n1(r.actualKwh)} kWh` },
									{ key: "p", color: c.ink2, label: "โมเดลทาย", value: `${n1(r.predictedKwh)} kWh` },
								]}
							/>
						);
					}}
				/>
				<Bar dataKey="actualKwh" fill={c.solar} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
				<Line dataKey="predictedKwh" stroke={c.ink2} strokeWidth={2} dot={{ r: 4, fill: c.ink2, stroke: c.card, strokeWidth: 2 }} activeDot={{ r: 5, stroke: c.card, strokeWidth: 2 }} isAnimationActive={false} />
			</ComposedChart>
		</ResponsiveContainer>
	);
}
