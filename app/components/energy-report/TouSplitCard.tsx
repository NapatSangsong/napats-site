import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { type CycleTotals, ENERGY_CONST as C } from "~/lib/energy-calc";
import { f0, f1, money, pc } from "~/lib/energy-format";
import type { RptTheme } from "./theme";
import { RptTipBox } from "./bits";

/** Donut: on-peak vs off-peak kWh with a center total and per-bucket ฿ rows */
export function TouSplitCard({ totals, ct }: { totals: CycleTotals; ct: RptTheme }) {
	const onPct = totals.total > 0 ? totals.on / totals.total : 0;
	const data = [
		{ key: "on", name: "On-peak", kwh: totals.on, baht: totals.on * C.TOU_ON, color: ct.on, rate: C.TOU_ON },
		{ key: "off", name: "Off-peak", kwh: totals.off, baht: totals.off * C.TOU_OFF, color: ct.off, rate: C.TOU_OFF },
	];

	return (
		<div className="ereport-donut-wrap">
			<div className="ereport-donut">
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie
							data={data}
							dataKey="kwh"
							nameKey="name"
							innerRadius="64%"
							outerRadius="92%"
							paddingAngle={2}
							cornerRadius={4}
							stroke={ct.surface}
							strokeWidth={2}
							isAnimationActive={false}
						>
							{data.map((d) => (
								<Cell key={d.key} fill={d.color} />
							))}
						</Pie>
						<Tooltip
							content={({ active, payload }) => {
								const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
								if (!active || !p) return null;
								return (
									<RptTipBox
										bg={ct.tooltipBg}
										ink={ct.tooltipText}
										title={p.name}
										rows={[
											{ dot: p.color, text: `${f1(p.kwh)} kWh × ${p.rate} = ฿${money(p.baht)}` },
										]}
									/>
								);
							}}
						/>
					</PieChart>
				</ResponsiveContainer>
				<div className="ereport-donut-center">
					<b className="mono">{f0(totals.total)}</b>
					<span>kWh</span>
					<span className="mono">{pc(onPct)}% on</span>
				</div>
			</div>
			<div className="ereport-donut-rows">
				{data.map((d) => (
					<div key={d.key} className="ereport-donut-row">
						<i style={{ background: d.color }} />
						<span>{d.name}</span>
						<b className="mono">฿{money(d.baht)}</b>
					</div>
				))}
				<p className="ereport-note">
					On-peak จ–ศ 09:00–21:59 ({C.TOU_ON}฿) · นอกนั้น Off-peak ({C.TOU_OFF}฿)
				</p>
			</div>
		</div>
	);
}
