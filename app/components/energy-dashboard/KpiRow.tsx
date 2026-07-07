import { Battery, BarChart2, TrendingDown, TrendingUp, Zap } from "lucide-react";
import type { CalcResult } from "~/lib/energy-calc";
import { ENERGY_CONST as C, dayNum, billingCycleOf } from "~/lib/energy-calc";
import { money, f0, f1, f2, dayMonthYear } from "~/lib/energy-format";
import type { LiveData } from "~/components/energy/types";
import { KpiCard } from "./KpiCard";

interface Props {
	calc: CalcResult;
	live: LiveData | null;
	liveOffline: boolean;
	solarPr: number;
}

export function KpiRow({ calc, live, liveOffline, solarPr }: Props) {
	const { a, f, fc, sv, outlook } = calc;

	// Cheapest scenario (same logic as ScenarioCards / Verdict); cost3 = TOU+4kW
	const scenarios: [string, number][] = [
		["Flat", f.cost1],
		["TOU", f.cost2],
		["TOU+4kW", f.cost3],
	];
	const cheapest = scenarios.reduce((b, o) => (o[1] < b[1] ? o : b));
	const savingsVsFlat = f.cost1 - cheapest[1];

	// Live power
	const powerW = live && !liveOffline ? live.power_w : null;
	const voltageV = live && !liveOffline ? live.voltage_v : null;

	// Bill-to-date: accrue from a.daily for the current billing cycle (cuts on the 2nd)
	const nowDay = dayNum(a.t1);
	const cycleStart = billingCycleOf(a.t1).startDay;
	const flatAvgPerKwh = f.cost1 / f.monthlyKwh;
	let accrued = 0;
	for (const [day, kwh] of a.daily) {
		if (day >= cycleStart && day <= nowDay) accrued += kwh * flatAvgPerKwh;
	}

	// Break-even
	const beLabel = sv.beDay ? dayMonthYear(sv.beDay) : (f.saveTou > 0 ? `${f2(f.beMonths)} เดือน` : "—");

	return (
		<div className="edash-kpi-row">
			{/* Live power */}
			<KpiCard
				label="Live Power"
				value={powerW !== null ? `${f0(powerW)} W` : "— W"}
				sub={voltageV !== null ? `${f1(voltageV)}V · PF ${live ? f2(live.power_factor) : "—"}` : "Offline"}
				accent="var(--off)"
				icon={<Zap size={12} />}
			/>

			{/* Bill accrued */}
			<KpiCard
				label="Bill (accrued)"
				value={`฿${money(accrued)}`}
				sub={`คาดสิ้นรอบ ฿${money(outlook.touBaht)} (TOU) · ฿${money(outlook.flatBaht)} (Flat)`}
				accent="var(--sun)"
				icon={<BarChart2 size={12} />}
			/>

			{/* Cheapest scenario */}
			<KpiCard
				label="ถูกสุด"
				value={`฿${money(cheapest[1])}`}
				sub={cheapest[0]}
				delta={`ประหยัด ฿${money(savingsVsFlat)}/mo vs Flat`}
				deltaType="pos"
				accent="var(--good)"
				icon={<TrendingDown size={12} />}
			/>

			{/* Savings vs flat */}
			<KpiCard
				label="TOU Savings vs Flat"
				value={`฿${money(f.saveTou)}`}
				sub={`สะสม ฿${money(sv.cumEnd)} (฿${money(sv.avgD)}/วัน)`}
				delta={f.saveTou > 0 ? `+${pc(f.saveTou / f.cost1)}% vs Flat` : "No savings"}
				deltaType={f.saveTou > 0 ? "pos" : "neg"}
				accent="var(--good)"
				icon={<TrendingUp size={12} />}
			/>

			{/* Break-even / payback */}
			<KpiCard
				label="Meter Break-even"
				value={sv.beDay ? beLabel : `${f.beMonths === Infinity ? "∞" : f2(f.beMonths)} เดือน`}
				sub={`Meter ฿${C.METER_COST.toLocaleString()} · ฿${money(sv.avgD)}/วัน · ${sv.pct.toFixed(0)}% covered`}
				accent="var(--purple)"
				icon={<Battery size={12} />}
			/>

			{/* Avg daily usage */}
			<KpiCard
				label="ใช้เฉลี่ย"
				value={`${f2(a.kwhDay)} kWh/day`}
				sub={`${f0(f.monthlyKwh)} kWh/เดือน · ${a.n.toLocaleString()} points · ${f1(a.spanDays)} วัน`}
				accent="var(--ink-dim)"
			/>
		</div>
	);
}

function pc(x: number): string { return (x * 100).toFixed(1); }
