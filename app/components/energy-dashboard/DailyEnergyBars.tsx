import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { TooltipPayload } from "recharts";
import type { Analysis } from "~/lib/energy-calc";
import { weekdayOf } from "~/lib/energy-calc";
import { dayOnly, dayMonth } from "~/lib/energy-format";
import type { ChartTheme } from "./theme";
import { ChartFrame } from "./ChartFrame";
import { Panel } from "./Panel";

interface Props {
	a: Analysis;
	ct: ChartTheme;
}

function CustomTooltip({ active, payload, ct }: { active?: boolean; payload?: TooltipPayload; ct: ChartTheme }) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="edash-tooltip" style={{ ["--tooltipBg" as string]: ct.tooltipBg }}>
			<div className="edash-tooltip-label">{d.label} {d.isWeekend ? "♦ weekend" : ""}</div>
			<div style={{ color: ct.tooltipText }}>{d.kwh.toFixed(2)} kWh</div>
		</div>
	);
}

export function DailyEnergyBars({ a, ct }: Props) {
	const days = [...a.daily.keys()].sort((x, y) => x - y);
	const data = days.map((day) => ({
		label: dayMonth(day),
		kwh: a.daily.get(day) ?? 0,
		isWeekend: weekdayOf(day) >= 5,
	}));

	const avgKwh = a.kwhDay;

	return (
		<Panel title="พลังงานรายวัน (kWh)">
			<ChartFrame>
				<BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
					<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
					<XAxis
						dataKey="label"
						tick={{ fill: ct.axis, fontSize: 10 }}
						axisLine={{ stroke: ct.grid }}
						tickLine={false}
						interval={5}
					/>
					<YAxis
						tick={{ fill: ct.axis, fontSize: 11 }}
						axisLine={false}
						tickLine={false}
						tickFormatter={(v) => `${v.toFixed(0)}`}
						width={28}
					/>
					<Tooltip content={(p) => <CustomTooltip {...p} ct={ct} />} />
					<Bar dataKey="kwh" radius={[3, 3, 0, 0]} maxBarSize={18}>
						{data.map((d, i) => (
							<Cell
								key={i}
								fill={d.isWeekend ? ct.off : ct.load}
								fillOpacity={0.85}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartFrame>
		</Panel>
	);
}
