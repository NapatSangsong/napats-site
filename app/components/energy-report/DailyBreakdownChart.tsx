import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	type BillingCycle,
	ENERGY_CONST as C,
	SOLAR_INSTALL_DAY,
} from "~/lib/energy-calc";
import { f1, money } from "~/lib/energy-format";
import { dayEnergyBaht, thDayMonth } from "./derive";
import type { RptTheme } from "./theme";
import { RptTipBox } from "./bits";
import type { ReportDailyRow } from "./types";

interface Datum {
	day: number;
	label: number; // day of month
	on: number;
	off: number;
	partial: boolean;
	missing: boolean;
	baht: number;
}

interface Props {
	rows: ReportDailyRow[];
	cycle: BillingCycle;
	nowDay: number;
	ct: RptTheme;
	onSelectDay: (day: number) => void;
}

const DAY_MS = 86400_000;
const domOf = (day: number) => new Date(day * DAY_MS).getUTCDate();

/** Stacked on/off-peak kWh per day of the cycle — tap a bar for the hourly drill-down */
export function DailyBreakdownChart({ rows, cycle, nowDay, ct, onSelectDay }: Props) {
	const byDay = new Map(rows.map((r) => [r.day, r]));
	const lastShown = Math.min(cycle.endDay, Math.max(nowDay, rows.at(-1)?.day ?? cycle.startDay));
	const data: Datum[] = [];
	for (let d = cycle.startDay; d <= lastShown; d++) {
		const r = byDay.get(d);
		data.push({
			day: d,
			label: domOf(d),
			on: r?.onKwh ?? 0,
			off: r?.offKwh ?? 0,
			partial: r ? r.hours < 23 : false,
			missing: !r,
			baht: r ? dayEnergyBaht(r) : 0,
		});
	}
	const installInView = SOLAR_INSTALL_DAY >= cycle.startDay && SOLAR_INSTALL_DAY <= cycle.endDay;

	return (
		<div className="ereport-chart ereport-chart-tall">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart
					data={data}
					margin={{ top: 18, right: 8, bottom: 0, left: -18 }}
					onClick={(s) => {
						const i = s.activeTooltipIndex;
						if (i == null) return;
						const datum = data[Number(i)];
						if (!datum || !byDay.get(datum.day)) return;
						onSelectDay(datum.day);
					}}
				>
					<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
					<XAxis
						dataKey="label"
						tick={{ fill: ct.axis, fontSize: 10 }}
						axisLine={{ stroke: ct.grid }}
						tickLine={false}
						interval="preserveStartEnd"
					/>
					<YAxis
						tick={{ fill: ct.axis, fontSize: 10 }}
						axisLine={false}
						tickLine={false}
						unit=""
					/>
					<Tooltip
						cursor={{ fill: ct.grid }}
						content={({ active, payload }) => {
							const p = payload?.[0]?.payload as Datum | undefined;
							if (!active || !p) return null;
							return (
								<RptTipBox
									bg={ct.tooltipBg}
									ink={ct.tooltipText}
									title={`${thDayMonth(p.day)}${p.partial ? " · ข้อมูลบางส่วน" : ""}${p.missing ? " · ไม่มีข้อมูล" : ""}`}
									rows={[
										{ dot: ct.on, text: `On-peak ${f1(p.on)} kWh (฿${money(p.on * C.TOU_ON)})` },
										{ dot: ct.off, text: `Off-peak ${f1(p.off)} kWh (฿${money(p.off * C.TOU_OFF)})` },
										{ text: `รวม ฿${money(p.baht)} · แตะเพื่อดูรายชั่วโมง` },
									]}
								/>
							);
						}}
					/>
					{/* off-peak sits on the baseline; on-peak stacks on top with rounded end */}
					<Bar dataKey="off" stackId="d" fill={ct.off} stroke={ct.surface} strokeWidth={1} isAnimationActive={false} cursor="pointer">
						{data.map((d) => (
							<Cell key={d.day} fillOpacity={d.partial ? 0.45 : 1} />
						))}
					</Bar>
					<Bar
						dataKey="on"
						stackId="d"
						fill={ct.on}
						stroke={ct.surface}
						strokeWidth={1}
						radius={[4, 4, 0, 0]}
						isAnimationActive={false}
						cursor="pointer"
					>
						{data.map((d) => (
							<Cell key={d.day} fillOpacity={d.partial ? 0.45 : 1} />
						))}
					</Bar>
					{nowDay >= cycle.startDay && nowDay <= lastShown && (
						<ReferenceLine
							x={domOf(nowDay)}
							stroke={ct.refLine}
							strokeDasharray="4 3"
							label={{ value: "วันนี้", position: "top", fill: ct.axis, fontSize: 10 }}
						/>
					)}
					{installInView && SOLAR_INSTALL_DAY <= lastShown && (
						<ReferenceLine
							x={domOf(SOLAR_INSTALL_DAY)}
							stroke={ct.solar}
							strokeDasharray="4 3"
							label={{ value: "ติดโซลาร์", position: "top", fill: ct.solar, fontSize: 10 }}
						/>
					)}
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
