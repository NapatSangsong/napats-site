import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	LabelList,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { type BillingCycle, cycleCosts } from "~/lib/energy-calc";
import { f0, f1, money } from "~/lib/energy-format";
import { TH_MONTHS, cycleRangeLabel, rowsInCycle, ymOfCycle } from "./derive";
import type { RptTheme } from "./theme";
import { RptTipBox } from "./bits";
import type { ReportDailyRow } from "./types";

interface Datum {
	ym: string;
	label: string;
	baht: number;
	perDay: number;
	kwh: number;
	days: number;
	cycleLen: number;
	partial: boolean;
	current: boolean;
	range: string;
}

interface Props {
	daily: ReportDailyRow[];
	cycles: BillingCycle[];
	selectedYm: string;
	nowDay: number;
	ct: RptTheme;
	onSelect: (ym: string) => void;
}

/** ฿ per billing cycle across all history — tap a bar to jump to that cycle */
export function MonthCompareChart({ daily, cycles, selectedYm, nowDay, ct, onSelect }: Props) {
	const data: Datum[] = cycles.map((c) => {
		const costs = cycleCosts(rowsInCycle(daily, c), c);
		const t = costs.totals;
		const current = nowDay >= c.startDay && nowDay <= c.endDay;
		return {
			ym: ymOfCycle(c),
			label: TH_MONTHS[c.m - 1],
			baht: costs.tou,
			perDay: t.days ? costs.tou / t.days : 0,
			kwh: t.total,
			days: t.days,
			cycleLen: t.cycleLen,
			partial: !current && t.coverage < 0.95,
			current,
			range: cycleRangeLabel(c),
		};
	});

	return (
		<div className="ereport-chart">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart
					data={data}
					margin={{ top: 22, right: 8, bottom: 0, left: -14 }}
					onClick={(s) => {
						const i = s.activeTooltipIndex;
						if (i == null) return;
						const p = data[Number(i)];
						if (p) onSelect(p.ym);
					}}
				>
					<CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
					<XAxis
						dataKey="label"
						tick={{ fill: ct.axis, fontSize: 11 }}
						axisLine={{ stroke: ct.grid }}
						tickLine={false}
					/>
					<YAxis
						tick={{ fill: ct.axis, fontSize: 10 }}
						axisLine={false}
						tickLine={false}
						tickFormatter={(v: number) => `฿${f0(v)}`}
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
									title={`รอบ ${p.range}${p.current ? " · กำลังดำเนิน" : ""}`}
									rows={[
										{ dot: ct.on, text: `฿${money(p.baht)} · ${f0(p.kwh)} kWh` },
										{ text: `เฉลี่ย ฿${f1(p.perDay)}/วัน · ข้อมูล ${p.days}/${p.cycleLen} วัน` },
										...(p.partial ? [{ text: "ข้อมูลไม่ครบรอบ — เทียบด้วย ฿/วัน" }] : []),
									]}
								/>
							);
						}}
					/>
					<Bar dataKey="baht" radius={[4, 4, 0, 0]} isAnimationActive={false} cursor="pointer">
						{data.map((d) => (
							<Cell
								key={d.ym}
								fill={ct.on}
								fillOpacity={d.ym === selectedYm ? 1 : d.partial ? 0.3 : 0.55}
								stroke={d.ym === selectedYm ? ct.ink : "none"}
								strokeWidth={d.ym === selectedYm ? 1 : 0}
							/>
						))}
						<LabelList
							dataKey="baht"
							position="top"
							formatter={(v) => `฿${f0(Number(v))}`}
							style={{ fill: ct.inkDim, fontSize: 10, fontFamily: "IBM Plex Mono" }}
						/>
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
