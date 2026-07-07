/**
 * Verifies the TS port of dashboard.py v10 against expected values produced
 * by the ORIGINAL Python formulas on the same real fixture
 * (scripts/gen_energy_expected.py — rerun it if the fixture changes).
 *
 * All time math is fixed-offset Asia/Bangkok, so results must be identical
 * regardless of the runner's TZ (verify with e.g. TZ=America/New_York).
 */
import { describe, expect, it } from "vitest";
import {
	ENERGY_CONST,
	SOLAR_INSTALL_DAY,
	analyze,
	billingCycleForYm,
	billingCycleOf,
	cycleCosts,
	cycleForecast,
	cycleTotals,
	dayNum,
	dayNumFromYmd,
	endOfCurrentCycleBkk,
	endOfCurrentMonthBkk,
	finance,
	forecast,
	ftRateForYm,
	hourOf,
	isCycleStartDay,
	savingsTrack,
	solarCurve,
	toPoints,
	weekdayOf,
} from "../energy-calc";
import expected from "./fixtures/expected.json";
import history from "./fixtures/tuya_history.json";

const isoToDayNum = (iso: string): number => {
	const [y, m, d] = iso.split("-").map(Number);
	return dayNumFromYmd(y, m, d);
};
const dayNumToIso = (day: number): string => new Date(day * 86400_000).toISOString().slice(0, 10);

const raw = (history as Array<{ code: string; event_time: number; value: string }>)
	.filter((h) => h.code === "forward_energy_total" && h.value != null)
	.map((h) => [h.event_time, h.value] as const);

const pts = toPoints(raw);
const a = analyze(pts);
const f = finance(a);
const fc = forecast(a, isoToDayNum(expected.forecast.forecast_end));
const sv = savingsTrack(f, fc);

const close = (actual: number, exp: number) => expect(actual).toBeCloseTo(exp, 6);

describe("BKK time helpers", () => {
	it("computes Bangkok hour/day across midnight", () => {
		// 2026-06-09 16:59:59.999 UTC = 2026-06-09 23:59:59.999 BKK
		const ms = Date.UTC(2026, 5, 9, 16, 59, 59, 999);
		expect(hourOf(ms)).toBe(23);
		expect(dayNum(ms)).toBe(dayNumFromYmd(2026, 6, 9));
		// +1ms → 2026-06-10 00:00 BKK
		expect(hourOf(ms + 1)).toBe(0);
		expect(dayNum(ms + 1)).toBe(dayNumFromYmd(2026, 6, 10));
	});

	it("matches Python weekday() (Mon=0)", () => {
		expect(weekdayOf(dayNumFromYmd(2026, 6, 8))).toBe(0); // Monday
		expect(weekdayOf(dayNumFromYmd(2026, 6, 7))).toBe(6); // Sunday
		expect(weekdayOf(dayNumFromYmd(2026, 6, 13))).toBe(5); // Saturday
	});

	it("finds end of current BKK month", () => {
		expect(dayNumToIso(endOfCurrentMonthBkk(Date.UTC(2026, 5, 10)))).toBe("2026-06-30");
		expect(dayNumToIso(endOfCurrentMonthBkk(Date.UTC(2026, 1, 5)))).toBe("2026-02-28");
		// 2026-06-30 17:30 UTC is already 2026-07-01 in BKK
		expect(dayNumToIso(endOfCurrentMonthBkk(Date.UTC(2026, 5, 30, 17, 30)))).toBe("2026-07-31");
	});
});

describe("analyze — vs python on real fixture", () => {
	const e = expected.analysis;

	it("loads the same point set", () => {
		expect(pts.length).toBe(expected.n_points);
		expect(a.t0).toBe(e.t0);
		expect(a.t1).toBe(e.t1);
	});

	it("matches bucket totals", () => {
		close(a.night, e.night);
		close(a.daytime, e.daytime);
		close(a.evening, e.evening);
		close(a.day0816, e.day0816);
		close(a.on, e.on);
		close(a.off, e.off);
		close(a.total, e.total);
		close(a.skipped, e.skipped);
		close(a.spanDays, e.span_days);
		close(a.kwhDay, e.kwh_day);
		close(a.lastMeter, e.last_meter);
	});

	it("matches hourly profiles", () => {
		for (let h = 0; h < 24; h++) {
			close(a.prof[h], e.prof[h]);
			close(a.wdProf[h], e.wd_prof[h]);
		}
		close(a.daytimeKwhD, e.daytime_kwh_d);
		close(a.baseloadKw, e.baseload_kw);
		close(a.eveningKwhD, e.evening_kwh_d);
	});

	it("matches daily maps and per-hour cells", () => {
		expect(a.daily.size).toBe(Object.keys(e.daily).length);
		for (const [iso, v] of Object.entries(e.daily)) close(a.daily.get(isoToDayNum(iso))!, v);
		for (const [iso, v] of Object.entries(e.daily_on)) close(a.dailyOn.get(isoToDayNum(iso))!, v);
		for (const [iso, v] of Object.entries(e.daily_off)) close(a.dailyOff.get(isoToDayNum(iso))!, v);
		for (const [iso, hours] of Object.entries(e.day_hours)) {
			expect([...a.dayHours.get(isoToDayNum(iso))!].sort((x, y) => x - y)).toEqual(hours);
		}
		expect(a.dh.size).toBe(Object.keys(e.dh).length);
		for (const [key, v] of Object.entries(e.dh)) {
			const [iso, h] = key.split("|");
			close(a.dh.get(isoToDayNum(iso) * 24 + Number(h))!, v);
		}
	});
});

describe("finance — vs python", () => {
	const e = expected.finance;
	it("matches every figure", () => {
		close(f.onPct, e.on_pct);
		close(f.offPct, e.off_pct);
		close(f.nightPct, e.night_pct);
		close(f.daytimePct, e.daytime_pct);
		close(f.eveningPct, e.evening_pct);
		close(f.day0816Pct, e.day0816_pct);
		close(f.measuredMo, e.measured_mo);
		close(f.monthlyKwh, e.monthly_kwh);
		close(f.onKwh, e.on_kwh);
		close(f.offKwh, e.off_kwh);
		close(f.cost1, e.cost1);
		close(f.cost2, e.cost2);
		close(f.cost3, e.cost3);
		close(f.scaleUp, e.scale_up);
		close(f.daytimeLoadD, e.daytime_load_d);
		close(f.usableD, e.usable_d);
		close(f.offsetOn, e.off_on);
		close(f.offsetOff, e.off_off);
		close(f.remOn, e.rem_on);
		close(f.remOff, e.rem_off);
		close(f.saveTou, e.save_tou);
		close(f.saveSolar, e.save_solar);
		close(f.tipKwhD, e.tip_kwh_d);
		expect(f.viable).toBe(e.viable);
		if (e.be_months === null) expect(f.beMonths).toBe(Infinity);
		else close(f.beMonths, e.be_months);
	});
});

describe("forecast — vs python (pinned end date)", () => {
	const e = expected.forecast;
	it("matches scalars", () => {
		close(fc.wdAvg, e.wd_avg);
		close(fc.weAvg, e.we_avg);
		close(fc.totalKwh, e.total_kwh);
		close(fc.futureKwh, e.future_kwh);
		close(fc.meterEnd, e.meter_end);
		close(fc.touCost, e.tou_cost);
		close(fc.flatCost, e.flat_cost);
		expect(fc.nDays).toBe(e.n_days);
	});

	it("matches every day", () => {
		expect(fc.days.length).toBe(e.days.length);
		for (let i = 0; i < e.days.length; i++) {
			const got = fc.days[i];
			const exp = e.days[i];
			expect(dayNumToIso(got.day)).toBe(exp.date);
			expect(got.kind).toBe(exp.kind);
			expect(got.weekend).toBe(exp.weekend);
			close(got.kwh, exp.kwh);
			close(got.on, exp.on);
			close(got.off, exp.off);
		}
	});
});

describe("savings — vs python", () => {
	const e = expected.savings;
	it("matches cumulative series", () => {
		close(sv.cumEnd, e.cum_end);
		close(sv.avgD, e.avg_d);
		close(sv.pct, e.pct);
		close(sv.scaleUp, e.scale_up);
		expect(sv.beDay === null ? null : dayNumToIso(sv.beDay)).toBe(e.be_date);
		expect(sv.series.length).toBe(e.series.length);
		for (let i = 0; i < e.series.length; i++) {
			close(sv.series[i].cum, e.series[i].cum);
			expect(sv.series[i].kind).toBe(e.series[i].kind);
		}
	});
});

describe("solar curve — vs python", () => {
	it("matches all 24 values and total", () => {
		const sol = solarCurve();
		for (let h = 0; h < 24; h++) close(sol[h], expected.solar_curve[h]);
		close(
			sol.reduce((s, v) => s + v, 0),
			ENERGY_CONST.SOLAR_KWH_D,
		);
	});
});

describe("synthetic edge cases", () => {
	const HOUR = 3600_000;
	// base: 2026-06-08 (Mon) 10:00 BKK = 03:00 UTC
	const base = Date.UTC(2026, 5, 8, 3, 0, 0);

	it("skips meter resets (negative delta)", () => {
		const series = toPoints([
			[base, 1000],
			[base + HOUR, 1100], // +1.0 kWh
			[base + 2 * HOUR, 50], // reset → skipped entirely
			[base + 3 * HOUR, 150], // +1.0 kWh
		]);
		const r = analyze(series);
		close(r.total, 2.0);
		close(r.skipped, 0);
	});

	it("routes deltas across >2h gaps into skipped", () => {
		const series = toPoints([
			[base, 1000],
			[base + HOUR, 1100], // +1.0 counted
			[base + 4 * HOUR, 1400], // 3h gap → +3.0 skipped
			[base + 5 * HOUR, 1500], // +1.0 counted
		]);
		const r = analyze(series);
		close(r.total, 2.0);
		close(r.skipped, 3.0);
	});

	it("dedupes identical (time, value) pairs like python sorted(set(...))", () => {
		const series = toPoints([
			[base, 1000],
			[base, 1000],
			[base + HOUR, 1100],
		]);
		expect(series.length).toBe(2);
	});
});

describe("billing cycle (cutoff = the 2nd, BKK)", () => {
	const C = ENERGY_CONST;

	it("cycle containing a mid-month instant", () => {
		// 2026-07-06 12:00 BKK = 05:00 UTC
		const c = billingCycleOf(Date.UTC(2026, 6, 6, 5, 0));
		expect(dayNumToIso(c.startDay)).toBe("2026-07-02");
		expect(dayNumToIso(c.endDay)).toBe("2026-08-01");
		expect([c.y, c.m]).toEqual([2026, 7]);
	});

	it("day-of-month 1 belongs to the PREVIOUS month's cycle", () => {
		// 2026-07-01 01:00 BKK = 2026-06-30 18:00 UTC
		const c = billingCycleOf(Date.UTC(2026, 5, 30, 18, 0));
		expect(dayNumToIso(c.startDay)).toBe("2026-06-02");
		expect(dayNumToIso(c.endDay)).toBe("2026-07-01");
		expect([c.y, c.m]).toEqual([2026, 6]);
	});

	it("day-of-month 2 at 00:00 BKK starts the new cycle", () => {
		// 2026-07-02 00:00 BKK = 2026-07-01 17:00 UTC
		const c = billingCycleOf(Date.UTC(2026, 6, 1, 17, 0));
		expect(dayNumToIso(c.startDay)).toBe("2026-07-02");
	});

	it("February cycle length", () => {
		const c = billingCycleForYm(2026, 2);
		expect(dayNumToIso(c.startDay)).toBe("2026-02-02");
		expect(dayNumToIso(c.endDay)).toBe("2026-03-01");
		expect(c.endDay - c.startDay + 1).toBe(28);
	});

	it("December cycle wraps the year", () => {
		const c = billingCycleForYm(2026, 12);
		expect(dayNumToIso(c.startDay)).toBe("2026-12-02");
		expect(dayNumToIso(c.endDay)).toBe("2027-01-01");
		// 2027-01-01 12:00 BKK is still inside the December cycle
		const jan1 = billingCycleOf(Date.UTC(2027, 0, 1, 5, 0));
		expect([jan1.y, jan1.m]).toEqual([2026, 12]);
	});

	it("month-index normalization (m1=0 → Dec of previous year)", () => {
		const c = billingCycleForYm(2026, 0);
		expect(dayNumToIso(c.startDay)).toBe("2025-12-02");
		expect([c.y, c.m]).toEqual([2025, 12]);
	});

	it("endOfCurrentCycleBkk + isCycleStartDay", () => {
		expect(dayNumToIso(endOfCurrentCycleBkk(Date.UTC(2026, 6, 6, 5, 0)))).toBe("2026-08-01");
		expect(isCycleStartDay(dayNumFromYmd(2026, 7, 2))).toBe(true);
		expect(isCycleStartDay(dayNumFromYmd(2026, 7, 1))).toBe(false);
		expect(isCycleStartDay(dayNumFromYmd(2026, 7, 3))).toBe(false);
	});

	it("ftRateForYm picks the latest period ≤ ym", () => {
		expect(ftRateForYm("2026-06")).toBe(0.1623);
		expect(ftRateForYm("2020-01")).toBe(0.1623); // before first entry → first rate
	});

	const cyc = billingCycleForYm(2026, 7); // 2 Jul – 1 Aug, len 31
	// Thu 2026-07-02 (weekday) and Sat 2026-07-04 (weekend), plus one outside
	const rows = [
		{ day: dayNumFromYmd(2026, 7, 1), totalKwh: 99, onKwh: 50, offKwh: 49, hours: 24 }, // outside (prev cycle)
		{ day: dayNumFromYmd(2026, 7, 2), totalKwh: 30, onKwh: 20, offKwh: 10, hours: 24 },
		{ day: dayNumFromYmd(2026, 7, 4), totalKwh: 24, onKwh: 0, offKwh: 24, hours: 12 }, // partial Sat
	];

	it("cycleTotals filters to the window and tracks coverage", () => {
		const t = cycleTotals(rows, cyc);
		expect(t.total).toBe(54);
		expect(t.on).toBe(20);
		expect(t.off).toBe(34);
		expect(t.days).toBe(2);
		expect(t.partialDays).toBe(1);
		expect(t.cycleLen).toBe(31);
		close(t.coverage, 2 / 31);
	});

	it("cycleCosts: TOU headline + solar gating", () => {
		// no solar (activeFrom = +Infinity ≡ never active in this window)
		const noSolar = cycleCosts(rows, cyc, { solarActiveFromDay: Infinity });
		close(noSolar.tou, 20 * C.TOU_ON + 34 * C.TOU_OFF + C.TOU_FIXED * (2 / 31));
		expect(noSolar.offsetKwh4k).toBe(0);
		close(noSolar.touSolar4k - noSolar.tou, 0); // no offset, no sub days

		// whole-cycle what-if (activeFrom = -Infinity): yield 4×5.3×0.75 = 15.9/day
		const whatIf = cycleCosts(rows, cyc, { solarActiveFromDay: -Infinity, solarPr: 0.75 });
		const y = C.SOLAR_4K_KWP * C.SOLAR_PSH * 0.75;
		const expOffset = Math.min(y, 20) + Math.min(y, 24); // Thu on-peak + Sat off-peak
		close(whatIf.offsetKwh4k, expOffset);
		expect(whatIf.solarDays).toBe(2);
		close(
			whatIf.touSolar4k,
			(20 - Math.min(y, 20)) * C.TOU_ON +
				(34 - Math.min(y, 24)) * C.TOU_OFF +
				C.TOU_FIXED * (2 / 31) +
				C.SOLAR_4K_SUB * (2 / 31),
		);
		// default gate is the real install day
		expect(cycleCosts(rows, cyc).solarDays).toBe(
			rows.filter((r) => r.day >= SOLAR_INSTALL_DAY && r.day >= cyc.startDay).length,
		);
	});

	it("cycleForecast slices fc.days to the window", () => {
		const mk = (d: number, kwh: number, on: number) => ({
			day: d,
			kwh,
			kind: "fc" as const,
			weekend: false,
			on,
			off: kwh - on,
		});
		const fcFake = {
			days: [
				mk(cyc.startDay - 1, 10, 5), // before window — excluded
				mk(cyc.startDay, 12, 6),
				mk(cyc.endDay, 8, 0),
			],
		} as unknown as Parameters<typeof cycleForecast>[0];
		const r = cycleForecast(fcFake, cyc);
		close(r.kwh, 20);
		expect(r.days).toBe(2);
		close(r.touBaht, 6 * C.TOU_ON + (6 + 8) * C.TOU_OFF + C.TOU_FIXED * (2 / 31));
	});
});

describe("isOnPeakHour / minuteOf (TOU helpers)", () => {
	it("on-peak = weekday 09:00–21:59 only", async () => {
		const { isOnPeakHour } = await import("../energy-calc");
		// Monday (wd=0)
		expect(isOnPeakHour(0, 8)).toBe(false);
		expect(isOnPeakHour(0, 9)).toBe(true);
		expect(isOnPeakHour(0, 21)).toBe(true);
		expect(isOnPeakHour(0, 22)).toBe(false);
		// Friday (wd=4) midday
		expect(isOnPeakHour(4, 12)).toBe(true);
		// Saturday/Sunday (wd=5,6) — always off-peak
		expect(isOnPeakHour(5, 12)).toBe(false);
		expect(isOnPeakHour(6, 12)).toBe(false);
	});

	it("minuteOf returns Bangkok minute-of-hour", async () => {
		const { minuteOf } = await import("../energy-calc");
		// 2026-06-11 17:30:00 UTC = 2026-06-12 00:30 BKK
		const ms = Date.UTC(2026, 5, 11, 17, 30, 0);
		expect(minuteOf(ms)).toBe(30);
		expect(minuteOf(ms + 29 * 60_000)).toBe(59);
		expect(minuteOf(ms + 30 * 60_000)).toBe(0);
	});
});
