import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	LabelList,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { TooltipPayload } from "recharts";
import type { Finance, Analysis } from "~/lib/energy-calc";
import { touSolarScenario, batteryEveningSaving, ENERGY_CONST as C } from "~/lib/energy-calc";
import { money } from "~/lib/energy-format";
import type { ChartTheme } from "./theme";
import { ChartFrame } from "./ChartFrame";
import { Panel } from "./Panel";

interface Props {
	f: Finance;
	a: Analysis;
	solarPr: number;
	ct: ChartTheme;
}

function CustomTooltip({ active, payload, ct }: { active?: boolean; payload?: TooltipPayload; ct: ChartTheme }) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="edash-tooltip" style={{ ["--tooltipBg" as string]: ct.tooltipBg }}>
			<div className="edash-tooltip-label">{d.name}</div>
			<div style={{ color: d.highlight ? ct.good : ct.tooltipText, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }}>
				฿{money(d.cost)}/mo
			</div>
		</div>
	);
}

export function ScenarioBars({ f, a, solarPr, ct }: Props) {
	const yield4 = 4 * C.SOLAR_PSH * solarPr;
	const s4 = touSolarScenario(f, yield4, 1399);
	const battSave = batteryEveningSaving(a, 4, 5, solarPr);
	const cost5 = Math.max(0, s4.cost - battSave);

	const costs = [f.cost1, f.cost2, f.cost3, s4.cost, cost5];
	const minCost = Math.min(f.cost1, f.cost2, f.cost3, s4.cost);

	const scenarios = [
		{ name: "Flat", cost: f.cost1, highlight: f.cost1 === minCost },
		{ name: "TOU", cost: f.cost2, highlight: f.cost2 === minCost },
		{ name: "TOU+2kW", cost: f.cost3, highlight: f.cost3 === minCost },
		{ name: "TOU+4kW", cost: s4.cost, highlight: s4.cost === minCost },
		{ name: "+4kW+Batt", cost: cost5, highlight: false },
	];

	const colors = [ct.flat, ct.tou, ct.tou2, ct.tou4, ct.batt];
	const maxCost = Math.max(...costs) * 1.05;

	return (
		<Panel title="ค่าไฟรายเดือน — 5 Scenarios">
			<ChartFrame>
				<BarChart
					data={scenarios}
					layout="vertical"
					margin={{ top: 4, right: 52, bottom: 0, left: 4 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
					<XAxis
						type="number"
						domain={[0, maxCost]}
						tick={{ fill: ct.axis, fontSize: 10 }}
						axisLine={{ stroke: ct.grid }}
						tickLine={false}
						tickFormatter={(v) => `฿${Math.round(v)}`}
					/>
					<YAxis
						type="category"
						dataKey="name"
						tick={{ fill: ct.axis, fontSize: 11 }}
						axisLine={false}
						tickLine={false}
						width={68}
					/>
					<Tooltip content={(p) => <CustomTooltip {...p} ct={ct} />} />
					<Bar dataKey="cost" radius={[0, 4, 4, 0]} maxBarSize={22}>
						{scenarios.map((s, i) => (
							<Cell
								key={s.name}
								fill={s.highlight ? ct.good : colors[i]}
								fillOpacity={s.highlight ? 1 : 0.8}
							/>
						))}
						<LabelList
							dataKey="cost"
							position="right"
							formatter={(v) => `฿${money(Number(v))}`}
							style={{ fill: ct.axis, fontSize: 10, fontFamily: "IBM Plex Mono,monospace" }}
						/>
					</Bar>
				</BarChart>
			</ChartFrame>
		</Panel>
	);
}
