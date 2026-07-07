import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { TooltipPayload } from "recharts";
import type { Savings, Forecast } from "~/lib/energy-calc";
import { ENERGY_CONST as C, isCycleStartDay } from "~/lib/energy-calc";
import { dayMonth, dayOnly, dayMonthYear } from "~/lib/energy-format";
import { money } from "~/lib/energy-format";
import type { ChartTheme } from "./theme";
import { ChartFrame } from "./ChartFrame";
import { Panel } from "./Panel";

interface Props {
	sv: Savings;
	fc: Forecast;
	ct: ChartTheme;
}

function CustomTooltip({ active, payload, label, ct }: { active?: boolean; payload?: TooltipPayload; label?: string | number; ct: ChartTheme }) {
	if (!active || !payload?.length) return null;
	return (
		<div className="edash-tooltip" style={{ ["--tooltipBg" as string]: ct.tooltipBg }}>
			<div className="edash-tooltip-label">วันที่ {label}</div>
			<div className="edash-tooltip-row">
				<span className="edash-tooltip-dot" style={{ background: ct.good }} />
				<span style={{ color: ct.tooltipText }}>สะสม ฿{money(Number(payload[0].value))}</span>
			</div>
		</div>
	);
}

export function SavingsAreaChart({ sv, fc, ct }: Props) {
	const data = sv.series.map((s) => ({
		day: dayOnly(s.day),
		cum: s.cum,
		isFc: s.kind === "fc",
	}));

	const beLabel = sv.beDay ? dayMonthYear(sv.beDay) : null;

	// Billing-cycle boundaries (cycle starts on the 2nd) within the series range
	const monthBoundaries = sv.series
		.filter((s) => isCycleStartDay(s.day))
		.map((s) => ({ xVal: dayOnly(s.day), label: `รอบ ${dayMonth(s.day)}` }));

	return (
		<Panel
			title="Cumulative TOU Savings vs Flat"
			legend={[
				{ color: ct.good, label: `สะสม ฿${money(sv.cumEnd)} (avg ฿${money(sv.avgD)}/วัน นับแต่ติดตั้ง)` },
			]}
		>
			<ChartFrame>
				<AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
					<defs>
						<linearGradient id="svGrad" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={ct.good} stopOpacity={0.4} />
							<stop offset="100%" stopColor={ct.good} stopOpacity={0.02} />
						</linearGradient>
					</defs>
					<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
					<XAxis
						dataKey="day"
						tick={{ fill: ct.axis, fontSize: 11 }}
						axisLine={{ stroke: ct.grid }}
						tickLine={false}
					/>
					<YAxis
						tick={{ fill: ct.axis, fontSize: 11 }}
						axisLine={false}
						tickLine={false}
						tickFormatter={(v) => `฿${Math.round(v)}`}
						width={52}
					/>
					<Tooltip content={(p) => <CustomTooltip {...p} ct={ct} />} />

					{/* Meter cost break-even line */}
					<ReferenceLine
						y={C.METER_COST}
						stroke={ct.solar}
						strokeDasharray="6 4"
						label={{
							value: `Meter ฿${C.METER_COST.toLocaleString()}`,
							fill: ct.solar,
							fontSize: 10,
							position: "insideTopRight",
						}}
					/>

					{/* TOU installation date marker */}
					<ReferenceLine
						x={dayOnly(sv.installDay)}
						stroke={ct.solar}
						strokeWidth={1.5}
						label={{
							value: "ติดตั้ง TOU 19 มิ.ย. 10:30",
							fill: ct.solar,
							fontSize: 9,
							position: "insideTopLeft",
						}}
					/>

					{/* Monthly billing cycle boundaries (1st of each month) */}
					{monthBoundaries.map((mb) => (
						<ReferenceLine
							key={mb.label}
							x={mb.xVal}
							stroke={ct.grid}
							strokeWidth={1}
							strokeDasharray="3 3"
							label={{
								value: `1 ${mb.label}`,
								fill: ct.axis,
								fontSize: 9,
								position: "insideTopRight",
							}}
						/>
					))}

					{/* Break-even projection */}
					{sv.beDay && (
						<ReferenceLine
							x={dayOnly(sv.beDay)}
							stroke={ct.good}
							strokeDasharray="4 4"
							label={{
								value: beLabel ?? "",
								fill: ct.good,
								fontSize: 10,
								position: "top",
							}}
						/>
					)}

					<Area
						type="monotone"
						dataKey="cum"
						stroke={ct.good}
						strokeWidth={2}
						fill="url(#svGrad)"
						dot={false}
						activeDot={{ r: 4, fill: ct.good }}
					/>
				</AreaChart>
			</ChartFrame>
		</Panel>
	);
}
