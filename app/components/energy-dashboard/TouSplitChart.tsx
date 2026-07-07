import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { TooltipPayload } from "recharts";
import type { Finance, Analysis } from "~/lib/energy-calc";
import { ENERGY_CONST as C } from "~/lib/energy-calc";
import { f1, pc } from "~/lib/energy-format";
import type { ChartTheme } from "./theme";
import { ChartFrame } from "./ChartFrame";
import { Panel } from "./Panel";

interface Props {
	f: Finance;
	a: Analysis;
	ct: ChartTheme;
}

function CustomTooltip({ active, payload, ct }: { active?: boolean; payload?: TooltipPayload; ct: ChartTheme }) {
	if (!active || !payload?.length) return null;
	const p = payload[0];
	return (
		<div className="edash-tooltip" style={{ ["--tooltipBg" as string]: ct.tooltipBg }}>
			<div className="edash-tooltip-label">{p.name}</div>
			<div style={{ color: ct.tooltipText }}>{pc(Number(p.value) / 100)}% · {f1(p.payload.kwh)} kWh</div>
			<div style={{ color: ct.axis, fontSize: "0.72rem" }}>@ {p.payload.rate}</div>
		</div>
	);
}

export function TouSplitChart({ f, a, ct }: Props) {
	const data = [
		{ name: "กลางคืน (off)", value: f.nightPct * 100, kwh: a.night, rate: `฿${C.TOU_OFF}/kWh`, color: ct.off },
		{ name: "กลางวัน (off+solar)", value: f.daytimePct * 100, kwh: a.daytime, rate: `฿${C.TOU_OFF}/kWh`, color: ct.solar },
		{ name: "ค่ำ (on-peak)", value: f.eveningPct * 100, kwh: a.evening, rate: `฿${C.TOU_ON}/kWh`, color: ct.peak },
	].filter((d) => d.value > 0);

	const cheapest = data.reduce((a, b) => (a.value < b.value ? a : b), data[0]);

	return (
		<Panel
			title="สัดส่วน TOU"
			legend={data.map((d) => ({ color: d.color, label: d.name }))}
		>
			<div className="edash-panel-body">
				<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
					<ChartFrame size="sm">
						<PieChart>
							<Tooltip content={(p) => <CustomTooltip {...p} ct={ct} />} />
							<Pie
								data={data}
								dataKey="value"
								nameKey="name"
								cx="50%"
								cy="50%"
								innerRadius="55%"
								outerRadius="80%"
								strokeWidth={2}
								stroke="transparent"
							>
								{data.map((d) => (
									<Cell key={d.name} fill={d.color} fillOpacity={0.9} />
								))}
							</Pie>
						</PieChart>
					</ChartFrame>
					<div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
						{data.map((d) => (
							<div key={d.name}>
								<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
									<span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0, display: "inline-block" }} />
									<span style={{ fontSize: "0.72rem", color: "var(--ink-dim)" }}>{d.name}</span>
								</div>
								<div className="edash-mono" style={{ fontSize: "1rem", fontWeight: 700, paddingLeft: 14 }}>
									{pc(d.value / 100)}%
								</div>
								<div style={{ fontSize: "0.68rem", color: "var(--ink-faint)", paddingLeft: 14 }}>{f1(d.kwh)} kWh · {d.rate}</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</Panel>
	);
}
