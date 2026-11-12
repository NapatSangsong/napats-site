/**
 * Forecast engine (energy-forecast.ts). Synthetic data with known answers: a roof that
 * really is k × GHI must be recovered by the fit, the TOU calendar must match MEA's rules,
 * and the money must add up bucket by bucket.
 */
import { describe, expect, it } from "vitest";
import {
	addDays,
	batteryPotential,
	bestSolarWindow,
	billingCycle,
	type Bucket,
	bkk,
	buildProfiles,
	dayStart,
	fillGaps,
	fitSolarModel,
	forecastBuckets,
	HOUR_MS,
	hourlySolarKwh,
	importCalibration,
	isPeak,
	SLOT_MS,
	scaleImport,
	summarize,
	type Tariff,
	type WeatherHour,
} from "../energy-forecast";

const TARIFF: Tariff = { peak: 6.31, offPeak: 2.93, sale: 2.2, serviceThb: 40.9 };
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`);

/** a bell of GHI over the day, peak 800 W/m² at 12:00, zero outside 06–18 */
const ghiAt = (hour: number, scale = 1) => (hour < 6 || hour >= 18 ? 0 : Math.round(800 * Math.sin(((hour + 0.5 - 6) / 12) * Math.PI) * scale));

function syntheticDays(days: string[], k: number, loadKw: (hour: number) => number) {
	const buckets: Bucket[] = [];
	const weather: WeatherHour[] = [];
	days.forEach((d, i) => {
		const scale = 0.6 + ((i * 37) % 40) / 100; // cloudiness varies by day
		for (let h = 0; h < 24; h++) {
			const t = at(d, `${String(h).padStart(2, "0")}:00`);
			const g = ghiAt(h, scale);
			weather.push({ t, ghi: g, cloud: 50, temp: 30 });
			for (let q = 0; q < 4; q++) buckets.push({ t: t + q * SLOT_MS, solar: k * g, load: loadKw(h) });
		}
	});
	return { buckets, weather };
}

describe("time + TOU", () => {
	it("bkk() reads Bangkok wall time", () => {
		expect(bkk(at("2026-11-12", "21:45"))).toMatchObject({ date: "2026-11-12", hour: 21, slot: 87, dow: 4 });
		expect(bkk(Date.parse("2026-11-11T17:00:00Z")).date).toBe("2026-11-12");
	});

	it("on-peak is Mon–Fri 09:00–21:59, never weekends or fixed holidays", () => {
		expect(isPeak(at("2026-11-12", "09:00"))).toBe(true); // Thu
		expect(isPeak(at("2026-11-12", "21:45"))).toBe(true);
		expect(isPeak(at("2026-11-12", "22:00"))).toBe(false);
		expect(isPeak(at("2026-11-12", "08:45"))).toBe(false);
		expect(isPeak(at("2026-11-14", "12:00"))).toBe(false); // Sat
		expect(isPeak(at("2026-12-10", "12:00"))).toBe(false); // Constitution Day (Thu)
	});

	it("billing cycle runs from the meter-reading day to the next one", () => {
		expect(billingCycle("2026-11-12", 2)).toEqual({ start: "2026-11-02", end: "2026-12-02", days: 30 });
		expect(billingCycle("2026-11-01", 2)).toEqual({ start: "2026-10-02", end: "2026-11-02", days: 31 });
		expect(billingCycle("2027-01-01", 2)).toEqual({ start: "2026-12-02", end: "2027-01-02", days: 31 });
	});
});

describe("summarize", () => {
	it("splits self-use / import / export per bucket and prices each by TOU", () => {
		const s = summarize(
			[
				{ t: at("2026-11-12", "10:00"), solar: 2, load: 1 }, // peak: self 0.25, export 0.25
				{ t: at("2026-11-12", "23:00"), solar: 0, load: 2 }, // off-peak import 0.5
				{ t: at("2026-11-12", "12:00"), solar: 1, load: 3 }, // peak: self 0.25, import 0.5
			],
			TARIFF,
		);
		expect(s.solarKwh).toBeCloseTo(0.75);
		expect(s.loadKwh).toBeCloseTo(1.5);
		expect(s.selfKwh).toBeCloseTo(0.5);
		expect(s.exportKwh).toBeCloseTo(0.25);
		expect(s.peakImportKwh).toBeCloseTo(0.5);
		expect(s.offPeakImportKwh).toBeCloseTo(0.5);
		expect(s.costThb).toBeCloseTo(0.5 * 6.31 + 0.5 * 2.93);
		expect(s.savingsThb).toBeCloseTo(0.5 * 6.31 + 0.25 * 2.2);
		expect(s.selfPoweredPct).toBeCloseTo(33.33, 1);
	});

	it("scaleImport only touches imported energy and its cost", () => {
		const s = summarize([{ t: at("2026-11-12", "12:00"), solar: 1, load: 3 }], TARIFF);
		const scaled = scaleImport(s, 0.9);
		expect(scaled.importKwh).toBeCloseTo(s.importKwh * 0.9);
		expect(scaled.costThb).toBeCloseTo(s.costThb * 0.9);
		expect(scaled.solarKwh).toBe(s.solarKwh);
		expect(scaled.savingsThb).toBe(s.savingsThb);
	});
});

describe("solar model", () => {
	const days = Array.from({ length: 10 }, (_, i) => addDays("2026-11-01", i));
	const { buckets, weather } = syntheticDays(days, 0.0017, () => 1);

	it("only complete hours count as samples", () => {
		const partial = buckets.slice(0, 3);
		expect(hourlySolarKwh(partial).size).toBe(0);
		expect(hourlySolarKwh(buckets).size).toBe(days.length * 24);
	});

	it("recovers the roof's true kWh per W/m², with near-zero backtest error", () => {
		const m = fitSolarModel(hourlySolarKwh(buckets), weather, 4);
		expect(m.kGlobal).toBeCloseTo(0.0017, 6);
		expect(m.kByHour[12]).toBeCloseTo(0.0017, 6);
		expect(m.days).toBe(10);
		expect(m.mapePct).not.toBeNull();
		expect(m.mapePct!).toBeLessThan(0.5);
	});

	it("never forecasts above the inverters' AC ceiling", () => {
		const m = fitSolarModel(hourlySolarKwh(buckets), weather, 1);
		const fc = forecastBuckets(at("2026-11-20", "12:00"), at("2026-11-20", "13:00"), m, new Map([[at("2026-11-20", "12:00"), { t: at("2026-11-20", "12:00"), ghi: 5000, cloud: 0, temp: 30 }]]), buildProfiles(buckets));
		expect(Math.max(...fc.map((b) => b.solar))).toBeLessThanOrEqual(1);
	});

	it("falls back to a sane prior with no history", () => {
		const m = fitSolarModel(new Map(), weather, 4);
		expect(m.kGlobal).toBeCloseTo(0.0032, 4);
		expect(m.mapePct).toBeNull();
	});
});

describe("profiles + forecast", () => {
	// weekdays use 2 kW at 19:00, weekends 3 kW, 0.5 kW otherwise
	const days = Array.from({ length: 14 }, (_, i) => addDays("2026-11-02", i)); // Mon 2 → Sun 15
	const load = (date: string) => (h: number) => (h === 19 ? ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) ? 3 : 2) : 0.5);
	const buckets = days.flatMap((d) => syntheticDays([d], 0.0017, load(d)).buckets);
	const weather = days.flatMap((d) => syntheticDays([d], 0.0017, load(d)).weather);
	const profiles = buildProfiles(buckets);
	const model = fitSolarModel(hourlySolarKwh(buckets), weather, 4);

	it("keeps weekday and weekend/holiday load shapes apart", () => {
		expect(profiles.loadWeekday[19 * 4]).toBeCloseTo(2);
		expect(profiles.loadOffDay[19 * 4]).toBeCloseTo(3);
		expect(profiles.loadWeekday[3 * 4]).toBeCloseTo(0.5);
		expect(profiles.days).toBe(14);
	});

	it("forecast uses weather when present and the solar climatology past the horizon", () => {
		const tue = "2026-11-17";
		const noon = at(tue, "12:00");
		const w = new Map([[noon, { t: noon, ghi: 600, cloud: 20, temp: 32 }]]);
		const [withWeather] = forecastBuckets(noon, noon + SLOT_MS, model, w, profiles);
		expect(withWeather.solar).toBeCloseTo(model.kByHour[12] * 600, 5);
		expect(withWeather.est).toBe(true);
		const [noWeather] = forecastBuckets(noon, noon + SLOT_MS, model, new Map(), profiles);
		expect(noWeather.solar).toBeCloseTo(profiles.solar[48], 6);
		const [evening] = forecastBuckets(at(tue, "19:00"), at(tue, "19:15"), model, w, profiles);
		expect(evening.load).toBeCloseTo(2);
	});

	it("fillGaps keeps measured buckets and models only the holes", () => {
		const d = "2026-11-10";
		const from = dayStart(d);
		const measured = buckets.filter((b) => b.t >= from && b.t < from + 2 * HOUR_MS && b.t !== from + SLOT_MS);
		const filled = fillGaps(measured, from, from + 2 * HOUR_MS, model, new Map(), profiles);
		expect(filled).toHaveLength(8);
		expect(filled.filter((b) => b.est)).toHaveLength(1);
		expect(filled[1].est).toBe(true);
	});
});

describe("insights", () => {
	it("bestSolarWindow finds the sunniest 3 hours and how much load they cover", () => {
		const d = "2026-11-13";
		const bs: Bucket[] = [];
		for (let h = 6; h < 18; h++) for (let q = 0; q < 4; q++) bs.push({ t: at(d, `${String(h).padStart(2, "0")}:00`) + q * SLOT_MS, solar: ghiAt(h) * 0.002, load: 1 });
		const w = bestSolarWindow(bs)!;
		expect(bkk(w.from).hour).toBe(10);
		expect(bkk(w.to).hour).toBe(13);
		expect(w.coverPct).toBe(100);
		expect(bestSolarWindow(bs.map((b) => ({ ...b, solar: 0.05 })))).toBeNull();
	});

	it("batteryPotential sizes to the median weekday on-peak import", () => {
		const hist: Bucket[] = [];
		["2026-11-09", "2026-11-10", "2026-11-11"].forEach((d, i) => {
			for (let q = 0; q < 4 * (i + 1); q++) hist.push({ t: at(d, "19:00") + q * SLOT_MS, solar: 0, load: 4 }); // 4, 8, 12 kWh
		});
		const b = batteryPotential(hist, TARIFF)!;
		expect(b.kwhPerWeekday).toBeCloseTo(8);
		expect(b.thbPerMonth).toBeCloseTo(8 * (6.31 - 2.93 / 0.9) * 22);
	});

	it("importCalibration compares full days only and clamps to ±10%", () => {
		const d = "2026-11-10";
		const day: Bucket[] = Array.from({ length: 96 }, (_, i) => ({ t: dayStart(d) + i * SLOT_MS, solar: 0, load: 1 })); // 24 kWh
		expect(importCalibration(day, new Map([[d, 23.4]]))).toBeCloseTo(0.975);
		expect(importCalibration(day, new Map([[d, 10]]))).toBe(0.9);
		expect(importCalibration(day.slice(0, 50), new Map([[d, 23.4]]))).toBe(1);
	});
});
