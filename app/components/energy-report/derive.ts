/**
 * Pure client-side derivations for /energy/report — Thai date labels, cycle
 * listing/slicing over the daily rows, and pace comparison. All day math uses
 * BKK dayNums (same convention as energy-calc).
 */
import {
	type BillingCycle,
	ENERGY_CONST as C,
	billingCycleForYm,
	billingCycleOf,
} from "~/lib/energy-calc";
import type { ReportDailyRow } from "./types";

const DAY_MS = 86400_000;

export const TH_MONTHS = [
	"ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
	"ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const;

const partsOf = (day: number) => {
	const dt = new Date(day * DAY_MS);
	return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
};

/** "2 ก.ค." */
export function thDayMonth(day: number): string {
	const { m, d } = partsOf(day);
	return `${d} ${TH_MONTHS[m]}`;
}

/** "ก.ค. 2026" — cycle title (start month) */
export const cycleTitle = (c: BillingCycle): string => `${TH_MONTHS[c.m - 1]} ${c.y}`;

/** "2 ก.ค. – 1 ส.ค." */
export const cycleRangeLabel = (c: BillingCycle): string =>
	`${thDayMonth(c.startDay)} – ${thDayMonth(c.endDay)}`;

/** "YYYY-MM" of a cycle — the ?ym= the API expects */
export const ymOfCycle = (c: BillingCycle): string => `${c.y}-${String(c.m).padStart(2, "0")}`;

/** All cycles from the first data day through the cycle containing nowMs, ascending */
export function listCycles(daily: readonly ReportDailyRow[], nowMs: number): BillingCycle[] {
	const current = billingCycleOf(nowMs);
	if (!daily.length) return [current];
	const first = billingCycleOf(daily[0].day * DAY_MS + 12 * 3600_000); // noon BKK-safe
	const out: BillingCycle[] = [];
	let y = first.y;
	let m = first.m;
	for (;;) {
		const c = billingCycleForYm(y, m);
		out.push(c);
		if (c.startDay >= current.startDay) break;
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
	}
	return out;
}

export const rowsInCycle = (
	daily: readonly ReportDailyRow[],
	c: BillingCycle,
): ReportDailyRow[] => daily.filter((r) => r.day >= c.startDay && r.day <= c.endDay);

/** TOU energy ฿ of one day (no fixed charges) */
export const dayEnergyBaht = (r: ReportDailyRow): number =>
	r.onKwh * C.TOU_ON + r.offKwh * C.TOU_OFF;

export interface Pace {
	/** ฿ energy accrued this cycle, first `elapsed` calendar days */
	cur: number;
	/** ฿ energy of the previous cycle over the same elapsed span */
	prev: number;
	/** (cur − prev) / prev — null when prev has no data in the span */
	pct: number | null;
	elapsedDays: number;
}

/** Same-elapsed-days comparison vs the previous cycle ("แพงกว่ารอบก่อน +8% ณ วันที่ N") */
export function paceVsPrev(
	daily: readonly ReportDailyRow[],
	cycle: BillingCycle,
	prev: BillingCycle | null,
	nowDay: number,
): Pace | null {
	if (!prev) return null;
	const elapsed = Math.min(nowDay, cycle.endDay) - cycle.startDay + 1;
	if (elapsed <= 0) return null;
	const sumSpan = (c: BillingCycle) => {
		let s = 0;
		let days = 0;
		for (const r of daily) {
			if (r.day < c.startDay || r.day > c.startDay + elapsed - 1) continue;
			s += dayEnergyBaht(r);
			days += 1;
		}
		return { s, days };
	};
	const cur = sumSpan(cycle);
	const prevSpan = sumSpan(prev);
	return {
		cur: cur.s,
		prev: prevSpan.s,
		pct: prevSpan.days > 0 && prevSpan.s > 0 ? (cur.s - prevSpan.s) / prevSpan.s : null,
		elapsedDays: elapsed,
	};
}
