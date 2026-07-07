import { useEffect, useRef, useState } from "react";
import { CalendarClock, Gauge, TrendingDown, TrendingUp, Zap } from "lucide-react";
import {
	type BillingCycle,
	type CycleCosts,
	type CycleOutlook,
	ENERGY_CONST as C,
} from "~/lib/energy-calc";
import { f0, f1, money, pc } from "~/lib/energy-format";
import { type Pace, dayEnergyBaht, thDayMonth } from "./derive";
import type { ReportDailyRow } from "./types";

/** Animated count-up for the hero ฿ — snaps instantly under reduced-motion */
function useCountUp(target: number, ms = 650): number {
	const [v, setV] = useState(target);
	const prevRef = useRef(target);
	useEffect(() => {
		const from = prevRef.current;
		prevRef.current = target;
		if (from === target) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setV(target);
			return;
		}
		let raf: number;
		const t0 = performance.now();
		const step = (t: number) => {
			const p = Math.min(1, (t - t0) / ms);
			const ease = 1 - (1 - p) ** 3;
			setV(from + (target - from) * ease);
			if (p < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [target, ms]);
	return v;
}

interface Props {
	rows: ReportDailyRow[];
	cycle: BillingCycle;
	costs: CycleCosts;
	outlook: CycleOutlook;
	pace: Pace | null;
	isCurrent: boolean;
}

export function SummaryTiles({ rows, cycle, costs, outlook, pace, isCurrent }: Props) {
	const t = costs.totals;
	const heroBaht = useCountUp(costs.tou);
	const onPct = t.total > 0 ? t.on / t.total : 0;

	// chips: peak / cheapest day, standby cost, coverage
	let peak: ReportDailyRow | null = null;
	let cheap: ReportDailyRow | null = null;
	let baseSum = 0;
	let baseN = 0;
	for (const r of rows) {
		if (!peak || dayEnergyBaht(r) > dayEnergyBaht(peak)) peak = r;
		if (!cheap || dayEnergyBaht(r) < dayEnergyBaht(cheap)) cheap = r;
		if (r.baseload != null) {
			baseSum += r.baseload;
			baseN += 1;
		}
	}
	const blended = t.total > 0 ? (t.on * C.TOU_ON + t.off * C.TOU_OFF) / t.total : C.TOU_OFF;
	const standbyMo = baseN ? (baseSum / baseN) * 24 * 30 * blended : null;
	const partialCycle = !isCurrent && t.coverage < 0.95;

	return (
		<section className="ereport-tiles" aria-label="สรุปรอบบิล">
			{/* hero — actual TOU bill */}
			<div className="ereport-tile ereport-tile-hero">
				<div className="ereport-tile-label">
					<Zap size={14} /> ค่าไฟรอบนี้ (TOU จริง)
				</div>
				<div className="ereport-tile-value mono">
					฿{money(heroBaht)}
					{isCurrent && <span className="ereport-tile-live">สะสม</span>}
				</div>
				<div className="ereport-tile-sub">
					On-peak ฿{money(t.on * C.TOU_ON)} · Off-peak ฿{money(t.off * C.TOU_OFF)} · ค่าบริการตามวัน
				</div>
				<div className="ereport-tile-sub ereport-tile-vs">
					ถ้าเป็นมิเตอร์ปกติ (Flat) ~฿{money(costs.flat)}{" "}
					<b className={costs.flat >= costs.tou ? "pos" : "neg"}>
						{costs.flat >= costs.tou ? "ประหยัด" : "แพงขึ้น"} ฿{money(Math.abs(costs.flat - costs.tou))}
					</b>
				</div>
			</div>

			{/* units */}
			<div className="ereport-tile">
				<div className="ereport-tile-label">
					<Gauge size={14} /> หน่วยรวม
				</div>
				<div className="ereport-tile-value mono">{f0(t.total)} kWh</div>
				<div className="ereport-tile-sub">
					On {f1(t.on)} ({pc(onPct)}%) · Off {f1(t.off)} · {t.days} วันมีข้อมูล
				</div>
			</div>

			{/* end-of-cycle projection (current cycle only) */}
			{isCurrent ? (
				<div className="ereport-tile">
					<div className="ereport-tile-label">
						<CalendarClock size={14} /> ประมาณการสิ้นรอบ
					</div>
					<div className="ereport-tile-value mono">฿{money(outlook.touBaht)}</div>
					<div className="ereport-tile-sub">
						~{f0(outlook.kwh)} kWh · เหลืออีก {outlook.futureDays} วัน (เฉลี่ยวันธรรมดา/วันหยุด)
					</div>
				</div>
			) : (
				<div className="ereport-tile">
					<div className="ereport-tile-label">
						<CalendarClock size={14} /> เฉลี่ยต่อวัน
					</div>
					<div className="ereport-tile-value mono">
						฿{money(t.days ? costs.tou / t.days : 0)}
					</div>
					<div className="ereport-tile-sub">
						{f1(t.days ? t.total / t.days : 0)} kWh/วัน
						{partialCycle && <b className="warn"> · ข้อมูล {t.days}/{t.cycleLen} วัน</b>}
					</div>
				</div>
			)}

			{/* pace vs previous cycle at the same elapsed day */}
			<div className="ereport-tile">
				<div className="ereport-tile-label">
					{pace?.pct != null && pace.pct > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{" "}
					เทียบรอบก่อน
				</div>
				{pace?.pct != null ? (
					<>
						<div className={`ereport-tile-value mono ${pace.pct > 0 ? "neg" : "pos"}`}>
							{pace.pct > 0 ? "+" : ""}
							{pc(pace.pct)}%
						</div>
						<div className="ereport-tile-sub">
							ณ วันที่ {pace.elapsedDays} ของรอบ · ฿{money(pace.cur)} vs ฿{money(pace.prev)}
						</div>
					</>
				) : (
					<>
						<div className="ereport-tile-value mono">—</div>
						<div className="ereport-tile-sub">รอบก่อนไม่มีข้อมูลช่วงเดียวกัน</div>
					</>
				)}
			</div>

			{/* chips row */}
			<div className="ereport-chips">
				{peak && (
					<span className="ereport-chip">
						แพงสุด <b>{thDayMonth(peak.day)}</b> ฿{money(dayEnergyBaht(peak))}
					</span>
				)}
				{cheap && peak !== cheap && (
					<span className="ereport-chip">
						ถูกสุด <b>{thDayMonth(cheap.day)}</b> ฿{money(dayEnergyBaht(cheap))}
					</span>
				)}
				{standbyMo != null && (
					<span className="ereport-chip">
						standby ~฿{f0(standbyMo)}/เดือน ({f1((baseSum / baseN) * 1000)} W ต่อเนื่อง)
					</span>
				)}
				{partialCycle && (
					<span className="ereport-chip warn">ข้อมูลไม่ครบรอบ — {t.days}/{t.cycleLen} วัน</span>
				)}
			</div>
		</section>
	);
}
