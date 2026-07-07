import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceLine,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { TooltipPayload } from "recharts";
import type { Forecast } from "~/lib/energy-calc";
import { dayOnly, money } from "~/lib/energy-format";
import type { ChartTheme } from "./theme";
import { ChartFrame } from "./ChartFrame";
import { Panel } from "./Panel";

interface Props {
	fc: Forecast;
	ct: ChartTheme;
}

const KIND_ALPHA: Record<string, number> = {
	actual: 1,
	partial: 0.7,
	today: 1,
	fc: 0.45,
};

function CustomTooltip({ active, payload, ct }: { active?: boolean; payload?: TooltipPayload; ct: ChartTheme }) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="edash-tooltip" style={{ ["--tooltipBg" as string]: ct.tooltipBg }}>
			<div className="edash-tooltip-label">วันที่ {d.label} {d.weekend ? "(weekend)" : "(weekday)"}</div>
			<div style={{ color: ct.tooltipText, fontSize: "0.8rem" }}>
				{d.kwh.toFixed(2)} kWh
				{d.kind === "fc" && " (forecast)"}
			</div>
			<div style={{ color: ct.axis, fontSize: "0.72rem", marginTop: 4 }}>
				On-peak {d.on.toFixed(2)} · Off {d.off.toFixed(2)} kWh
			</div>
		</div>
	);
}

export function ForecastBars({ fc, ct }: Props) {
	const today = fc.days.find((d) => d.kind === "today");
	const data = fc.days.map((d) => ({
		label: dayOnly(d.day),
		kwh: d.kwh,
		kind: d.kind,
		weekend: d.weekend,
		on: d.on,
		off: d.off,
	}));

	const maxKwh = Math.max(...data.map((d) => d.kwh)) * 1.15;

	return (
		<Panel
			title="พยากรณ์สิ้นเดือน"
			legend={[
				{ color: ct.actual, label: "actual" },
				{ color: ct.forecast, label: "forecast" },
			]}
		>
			<div className="edash-panel-body" style={{ paddingBottom: 6 }}>
				<div style={{ display: "flex", gap: 20, marginBottom: 10, fontSize: "0.78rem", flexWrap: "wrap" }}>
					<span style={{ color: "var(--ink-dim)" }}>
						คาด <span className="edash-mono" style={{ color: "var(--ink)", fontWeight: 700 }}>{fc.totalKwh.toFixed(0)} kWh</span>/เดือน
					</span>
					<span style={{ color: "var(--ink-dim)" }}>
						TOU <span className="edash-mono" style={{ color: "var(--ink)", fontWeight: 700 }}>฿{money(fc.touCost)}</span>
					</span>
					<span style={{ color: "var(--ink-dim)" }}>
						Flat <span className="edash-mono" style={{ color: "var(--ink-dim)" }}>฿{money(fc.flatCost)}</span>
					</span>
				</div>
				<ChartFrame size="sm">
					<BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
						<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
						<XAxis
							dataKey="label"
							tick={{ fill: ct.axis, fontSize: 10 }}
							axisLine={{ stroke: ct.grid }}
							tickLine={false}
							interval={4}
						/>
						<YAxis
							domain={[0, maxKwh]}
							tick={{ fill: ct.axis, fontSize: 11 }}
							axisLine={false}
							tickLine={false}
							tickFormatter={(v) => `${v.toFixed(0)}`}
							width={28}
						/>
						<Tooltip content={(p) => <CustomTooltip {...p} ct={ct} />} />
						{today && (
							<ReferenceLine
								x={dayOnly(today.day)}
								stroke={ct.solar}
								strokeDasharray="4 4"
								label={{ value: "today", fill: ct.solar, fontSize: 10, position: "top" }}
							/>
						)}
						<Bar dataKey="kwh" radius={[3, 3, 0, 0]} maxBarSize={20}>
							{data.map((d, i) => (
								<Cell
									key={i}
									fill={d.kind === "fc" ? ct.forecast : d.weekend ? ct.off : ct.actual}
									fillOpacity={KIND_ALPHA[d.kind] ?? 1}
								/>
							))}
						</Bar>
					</BarChart>
				</ChartFrame>
			</div>
		</Panel>
	);
}
