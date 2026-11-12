/**
 * Forecast engine for the /energy page. Pure functions, no I/O: the server assembler
 * (energy-model.server.ts) feeds it BlueRing 15-min buckets and Open-Meteo hourly weather.
 *
 * Solar: a per-hour-of-day linear model, kWh(hour) = k[h] × GHI, fitted by least squares
 *   on this roof's real output vs Open-Meteo's radiation for the same hours. It replaces a
 *   guessed performance ratio with one learned from the panels (orientation, shading and
 *   inverter losses all fold into k). Per-hour k is shrunk toward the global k, so a few
 *   odd hours can't swing it. Accuracy comes from a leave-one-day-out backtest.
 * Load: the mean 15-min profile over recent days, kept separately for weekdays and for
 *   weekends/holidays.
 * Money: MEA TOU, using the rates set in BlueRing (Ft + VAT already included) plus the
 *   monthly service charge.
 *
 * Time: Bangkok is a fixed UTC+7 (no DST), so plain offset arithmetic is exact.
 */

export const BKK_OFFSET_MS = 7 * 3600_000;
export const SLOT_MS = 15 * 60_000;
export const HOUR_MS = 3600_000;
export const DAY_MS = 86_400_000;

/** One 15-min bucket. Values are average kW over the bucket, so kWh = kW × 0.25. */
export interface Bucket {
	t: number;
	solar: number;
	load: number;
	/** true when filled in by the model rather than measured */
	est?: boolean;
}

/** One weather hour. `t` is the hour START (Open-Meteo radiation covers the preceding hour). */
export interface WeatherHour {
	t: number;
	ghi: number;
	cloud: number;
	temp: number;
}

export interface Tariff {
	peak: number;
	offPeak: number;
	sale: number;
	/** monthly fixed charge, VAT included */
	serviceThb: number;
}

// ---------------- time ----------------

export interface BkkParts {
	date: string;
	dow: number;
	hour: number;
	minute: number;
	slot: number;
}

export function bkk(ms: number): BkkParts {
	const d = new Date(ms + BKK_OFFSET_MS);
	const hour = d.getUTCHours();
	const minute = d.getUTCMinutes();
	return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay(), hour, minute, slot: hour * 4 + Math.floor(minute / 15) };
}

/** Bangkok midnight of a YYYY-MM-DD, as epoch ms */
export const dayStart = (date: string) => Date.parse(`${date}T00:00:00+07:00`);

export function addDays(date: string, n: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
	return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

// ---------------- TOU ----------------

/**
 * Days MEA bills as off-peak all day, besides Sat/Sun. MEA's rule (กกพ. 7 Apr 2566, on
 * MEA's residential TOU page): "วันเสาร์และวันอาทิตย์ วันแรงงานแห่งชาติ และวันหยุดราชการ
 * ตามปกติ", excluding Royal Ploughing Day, substitution holidays (วันหยุดชดเชย) and
 * cabinet-added special holidays. Lunar holidays and Khao Phansa DO count, so the list
 * changes every year and has to come from MEA's own calendar.
 *
 * 2569 (2026): copied from the 2569 column on
 * https://www.mea.or.th/electricity/electricity-tariffs/B0kv94Yol (checked 2026-11-12).
 * Add each new year from MEA's "ปฏิทินวันหยุด Off Peak" when it's published.
 */
export const TOU_HOLIDAYS: Readonly<Record<number, readonly string[]>> = {
	2026: [
		"2026-01-01", // วันขึ้นปีใหม่
		"2026-03-03", // วันมาฆบูชา
		"2026-04-06", // วันจักรี
		"2026-04-13", // วันสงกรานต์
		"2026-04-14", // วันสงกรานต์
		"2026-04-15", // วันสงกรานต์
		"2026-05-01", // วันแรงงานแห่งชาติ
		"2026-05-04", // วันฉัตรมงคล
		"2026-05-31", // วันวิสาขบูชา (Sun)
		"2026-06-03", // วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี
		"2026-07-28", // วันเฉลิมพระชนมพรรษา ร.10
		"2026-07-29", // วันอาสาฬหบูชา
		"2026-07-30", // วันเข้าพรรษา
		"2026-08-12", // วันแม่แห่งชาติ
		"2026-10-13", // วันนวมินทรมหาราช
		"2026-10-23", // วันปิยมหาราช
		"2026-12-05", // วันพ่อแห่งชาติ (Sat)
		"2026-12-10", // วันรัฐธรรมนูญ
		"2026-12-31", // วันสิ้นปี
	],
};
const TOU_HOLIDAY_SET = new Set(Object.values(TOU_HOLIDAYS).flat());

/**
 * For a year MEA hasn't published yet: only the fixed-date holidays. Lunar ones (Makha,
 * Visakha, Asalha, Khao Phansa) are then billed as weekdays, overstating cost by a few baht
 * on each of those days. The page flags it (touHolidaysVerified).
 */
const FIXED_HOLIDAYS = new Set([
	"01-01", "04-06", "04-13", "04-14", "04-15", "05-01", "05-04", "06-03",
	"07-28", "08-12", "10-13", "10-23", "12-05", "12-10", "12-31",
]);

/**
 * Changes whenever anything that prices a stored day changes (rates or the holiday
 * calendar), so cached per-day costs are recomputed instead of silently going stale.
 */
export function pricingSignature(t: Tariff): string {
	const years = Object.keys(TOU_HOLIDAYS).join(".");
	return `${t.peak}-${t.offPeak}-${t.sale}-h${years}x${TOU_HOLIDAY_SET.size}`;
}

/** true when the year's off-peak holidays come from MEA's published calendar */
export function touHolidaysVerified(year: number): boolean {
	return year in TOU_HOLIDAYS;
}

export function isOffPeakDay(date: string, dow: number): boolean {
	if (dow === 0 || dow === 6) return true;
	return touHolidaysVerified(Number(date.slice(0, 4))) ? TOU_HOLIDAY_SET.has(date) : FIXED_HOLIDAYS.has(date.slice(5));
}

/** MEA TOU on-peak: Mon–Fri 09:00–21:59, excluding holidays */
export function isPeak(ms: number): boolean {
	const p = bkk(ms);
	return !isOffPeakDay(p.date, p.dow) && p.hour >= 9 && p.hour < 22;
}

// ---------------- summaries ----------------

export interface Summary {
	solarKwh: number;
	loadKwh: number;
	/** solar used in the house */
	selfKwh: number;
	importKwh: number;
	exportKwh: number;
	peakImportKwh: number;
	offPeakImportKwh: number;
	/** energy charge for the imported kWh (no service charge) */
	costThb: number;
	/** what the solar saved: self-used kWh at the rate of that moment + export × sale */
	savingsThb: number;
	/** share of the load covered by solar, 0–100 */
	selfPoweredPct: number;
	buckets: number;
	estimatedBuckets: number;
}

export function emptySummary(): Summary {
	return {
		solarKwh: 0, loadKwh: 0, selfKwh: 0, importKwh: 0, exportKwh: 0,
		peakImportKwh: 0, offPeakImportKwh: 0, costThb: 0, savingsThb: 0,
		selfPoweredPct: 0, buckets: 0, estimatedBuckets: 0,
	};
}

export function summarize(buckets: Bucket[], tariff: Tariff): Summary {
	const s = emptySummary();
	for (const b of buckets) {
		const solar = Math.max(0, b.solar) * 0.25;
		const load = Math.max(0, b.load) * 0.25;
		const self = Math.min(solar, load);
		const imp = Math.max(0, load - solar);
		const exp = Math.max(0, solar - load);
		const peak = isPeak(b.t);
		const rate = peak ? tariff.peak : tariff.offPeak;
		s.solarKwh += solar;
		s.loadKwh += load;
		s.selfKwh += self;
		s.importKwh += imp;
		s.exportKwh += exp;
		if (peak) s.peakImportKwh += imp;
		else s.offPeakImportKwh += imp;
		s.costThb += imp * rate;
		s.savingsThb += self * rate + exp * tariff.sale;
		s.buckets++;
		if (b.est) s.estimatedBuckets++;
	}
	s.selfPoweredPct = s.loadKwh > 0 ? (s.selfKwh / s.loadKwh) * 100 : 0;
	return s;
}

export function addSummaries(a: Summary, b: Summary): Summary {
	const out = emptySummary();
	for (const k of Object.keys(out) as (keyof Summary)[]) out[k] = a[k] + b[k];
	out.selfPoweredPct = out.loadKwh > 0 ? (out.selfKwh / out.loadKwh) * 100 : 0;
	return out;
}

// ---------------- solar model ----------------

export interface SolarModel {
	/** kWh per (W/m²) for each Bangkok hour of day */
	kByHour: number[];
	kGlobal: number;
	/** AC ceiling: no hour can exceed this many kWh */
	capKw: number;
	/** distinct days the fit learned from */
	days: number;
	samples: number;
	/** leave-one-day-out daily error, % (null with fewer than 3 testable days) */
	mapePct: number | null;
	backtest: { date: string; actualKwh: number; predictedKwh: number }[];
}

/** Complete hours only (all four buckets present): hour start → kWh */
export function hourlySolarKwh(buckets: Bucket[]): Map<number, number> {
	const acc = new Map<number, { kwh: number; n: number }>();
	for (const b of buckets) {
		if (b.est) continue;
		const h = b.t - (b.t % HOUR_MS);
		const a = acc.get(h) ?? { kwh: 0, n: 0 };
		a.kwh += Math.max(0, b.solar) * 0.25;
		a.n++;
		acc.set(h, a);
	}
	const out = new Map<number, number>();
	for (const [h, a] of acc) if (a.n === 4) out.set(h, a.kwh);
	return out;
}

interface Sample {
	date: string;
	hour: number;
	g: number;
	a: number;
}

/** pseudo-samples of the global k each hour's fit is shrunk toward */
const SHRINK_SAMPLES = 3;

function fitFromSamples(samples: Sample[], capKw: number): Pick<SolarModel, "kByHour" | "kGlobal"> {
	let sxy = 0;
	let sxx = 0;
	const hx = Array.from({ length: 24 }, () => ({ sxy: 0, sxx: 0, n: 0 }));
	for (const s of samples) {
		sxy += s.a * s.g;
		sxx += s.g * s.g;
		hx[s.hour].sxy += s.a * s.g;
		hx[s.hour].sxx += s.g * s.g;
		hx[s.hour].n++;
	}
	// no history yet: a 4 kW-class roof at PR 0.8 makes ≈ capKw × 0.8 kWh at 1000 W/m²
	const kGlobal = sxx > 0 ? sxy / sxx : (capKw * 0.8) / 1000;
	const kByHour = hx.map((h) => {
		if (h.n === 0) return kGlobal;
		const prior = SHRINK_SAMPLES * (h.sxx / h.n);
		return (h.sxy + prior * kGlobal) / (h.sxx + prior);
	});
	return { kByHour, kGlobal };
}

export function fitSolarModel(actual: Map<number, number>, weather: WeatherHour[], capKw: number): SolarModel {
	const samples: Sample[] = [];
	for (const w of weather) {
		const a = actual.get(w.t);
		if (a === undefined || w.ghi < 5) continue;
		const p = bkk(w.t);
		samples.push({ date: p.date, hour: p.hour, g: w.ghi, a });
	}
	const { kByHour, kGlobal } = fitFromSamples(samples, capKw);
	const dates = [...new Set(samples.map((s) => s.date))].sort();

	// leave-one-day-out: refit without day d, predict day d's daylight hours
	const backtest: SolarModel["backtest"] = [];
	for (const d of dates) {
		const day = samples.filter((s) => s.date === d);
		const actualKwh = day.reduce((t, s) => t + s.a, 0);
		if (day.length < 6 || actualKwh < 0.5) continue;
		const rest = samples.filter((s) => s.date !== d);
		if (!rest.length) continue;
		const m = fitFromSamples(rest, capKw);
		const predictedKwh = day.reduce((t, s) => t + Math.min(capKw, m.kByHour[s.hour] * s.g), 0);
		backtest.push({ date: d, actualKwh, predictedKwh });
	}
	const mapePct =
		backtest.length >= 3
			? (backtest.reduce((t, b) => t + Math.abs(b.predictedKwh - b.actualKwh) / b.actualKwh, 0) / backtest.length) * 100
			: null;

	return { kByHour, kGlobal, capKw, days: dates.length, samples: samples.length, mapePct, backtest };
}

export function predictHourKwh(model: SolarModel, w: WeatherHour): number {
	if (w.ghi <= 0) return 0;
	return Math.min(model.capKw, Math.max(0, model.kByHour[bkk(w.t).hour] * w.ghi));
}

// ---------------- load + solar climatology profiles ----------------

export interface Profiles {
	/** mean load kW per 15-min slot (96) */
	loadWeekday: number[];
	loadOffDay: number[];
	/** mean solar kW per slot, used past the weather horizon */
	solar: number[];
	days: number;
}

export function buildProfiles(buckets: Bucket[]): Profiles {
	const mk = () => Array.from({ length: 96 }, () => ({ s: 0, n: 0 }));
	const wd = mk();
	const off = mk();
	const sol = mk();
	const days = new Set<string>();
	for (const b of buckets) {
		if (b.est) continue;
		const p = bkk(b.t);
		days.add(p.date);
		const bin = isOffPeakDay(p.date, p.dow) ? off : wd;
		bin[p.slot].s += b.load;
		bin[p.slot].n++;
		sol[p.slot].s += b.solar;
		sol[p.slot].n++;
	}
	const mean = (arr: { s: number; n: number }[], fallback?: number[]) =>
		arr.map((x, i) => (x.n ? x.s / x.n : (fallback?.[i] ?? 0)));
	const loadWeekday = mean(wd);
	const loadOffDay = mean(off, loadWeekday);
	return {
		loadWeekday: wd.some((x) => x.n) ? loadWeekday : loadOffDay,
		loadOffDay,
		solar: mean(sol),
		days: days.size,
	};
}

/** Model buckets for [from, to). Solar comes from weather where available, else climatology. */
export function forecastBuckets(
	from: number,
	to: number,
	model: SolarModel,
	weather: Map<number, WeatherHour>,
	profiles: Profiles,
): Bucket[] {
	const out: Bucket[] = [];
	for (let t = from - (from % SLOT_MS); t < to; t += SLOT_MS) {
		const p = bkk(t);
		const w = weather.get(t - (t % HOUR_MS));
		const solar = w ? predictHourKwh(model, w) : profiles.solar[p.slot];
		const load = (isOffPeakDay(p.date, p.dow) ? profiles.loadOffDay : profiles.loadWeekday)[p.slot];
		out.push({ t, solar, load, est: true });
	}
	return out;
}

/** Measured buckets for [from, to), gaps (gateway offline) filled from the model */
export function fillGaps(
	actual: Bucket[],
	from: number,
	to: number,
	model: SolarModel,
	weather: Map<number, WeatherHour>,
	profiles: Profiles,
): Bucket[] {
	const have = new Map(actual.filter((b) => b.t >= from && b.t < to).map((b) => [b.t, b]));
	const out: Bucket[] = [];
	for (let t = from; t < to; t += SLOT_MS) {
		out.push(have.get(t) ?? forecastBuckets(t, t + SLOT_MS, model, weather, profiles)[0]);
	}
	return out;
}

// ---------------- billing cycle ----------------

export interface Cycle {
	start: string;
	/** exclusive: the next meter-reading day */
	end: string;
	days: number;
}

export function billingCycle(today: string, readingDay: number): Cycle {
	const [y, m, d] = today.split("-").map(Number);
	const day = Math.min(Math.max(1, readingDay), 28);
	const startMonth = d >= day ? m - 1 : m - 2; // 0-based month
	const s = new Date(Date.UTC(y, startMonth, day));
	const e = new Date(Date.UTC(y, startMonth + 1, day));
	const start = s.toISOString().slice(0, 10);
	const end = e.toISOString().slice(0, 10);
	return { start, end, days: daysBetween(start, end) };
}

/** Every billing cycle from the one containing `firstDate` up to the one containing `today` */
export function cyclesSince(firstDate: string, today: string, readingDay: number): Cycle[] {
	const out: Cycle[] = [];
	let c = billingCycle(firstDate, readingDay);
	for (let guard = 0; guard < 240 && c.start <= today; guard++) {
		out.push(c);
		c = billingCycle(c.end, readingDay);
	}
	return out;
}

/** Measured buckets summarised per Bangkok day (modelled buckets are skipped) */
export function daySummaries(buckets: Bucket[], tariff: Tariff): Map<string, Summary> {
	const byDay = new Map<string, Bucket[]>();
	for (const b of buckets) {
		if (b.est) continue;
		const d = bkk(b.t).date;
		(byDay.get(d) ?? byDay.set(d, []).get(d)!).push(b);
	}
	return new Map([...byDay].map(([d, bs]) => [d, summarize(bs, tariff)]));
}

/**
 * ± half-width for a projected bill: day-to-day spread of the daily energy cost,
 * grown with √(days still to come). Days are treated as independent, which is honest
 * for weather and habits but ignores trends (e.g. a heatwave week).
 */
export function billSpread(dailyCosts: number[], remainingDays: number): number {
	if (dailyCosts.length < 5 || remainingDays <= 0) return 0;
	const mean = dailyCosts.reduce((t, c) => t + c, 0) / dailyCosts.length;
	const sd = Math.sqrt(dailyCosts.reduce((t, c) => t + (c - mean) ** 2, 0) / (dailyCosts.length - 1));
	return sd * Math.sqrt(remainingDays);
}

// ---------------- receipt calibration ----------------

/** One MEA bill: the meter-reading day (= the cycle's exclusive end), units and amount */
export interface MeaBill {
	read: string;
	kwh: number;
	thb: number;
}

/**
 * Parse the MEA_BILLS secret: a JSON array of { read: "YYYY-MM-DD", kwh, thb }. Kept out of
 * git (the repo is public). Malformed entries are dropped, never thrown on.
 */
export function parseMeaBills(json: string | undefined): MeaBill[] {
	if (!json) return [];
	try {
		const arr = JSON.parse(json) as unknown;
		if (!Array.isArray(arr)) return [];
		return arr
			.filter(
				(b): b is MeaBill =>
					!!b &&
					typeof b === "object" &&
					/^\d{4}-\d{2}-\d{2}$/.test(String((b as MeaBill).read)) &&
					Number.isFinite((b as MeaBill).kwh) &&
					Number.isFinite((b as MeaBill).thb) &&
					(b as MeaBill).kwh > 0,
			)
			.sort((a, b) => a.read.localeCompare(b.read));
	} catch {
		return [];
	}
}

export interface Calibration {
	/** multiplies imported kWh (MEA meter ÷ BlueRing) */
	kwhFactor: number;
	/** multiplies energy cost after kwhFactor (Ft/rounding the tariff misses) */
	priceFactor: number;
	source: "receipts" | "bluering" | "none";
	/** fully measured cycles with a receipt that the fit used */
	cycles: number;
}

/**
 * Fit both factors on cycles that have a receipt and complete BlueRing data:
 *   kwhFactor   = Σ MEA kWh ÷ Σ BlueRing import
 *   priceFactor = Σ (MEA ฿ − service) ÷ Σ (BlueRing energy cost × kwhFactor)
 * Each is clamped to ±15%, so a typo in a receipt can't wreck the page. null with no pair.
 */
export function receiptCalibration(
	pairs: { meaKwh: number; meaThb: number; rawImportKwh: number; rawCostThb: number }[],
	serviceThb: number,
): Calibration | null {
	const ok = pairs.filter((p) => p.rawImportKwh > 0 && p.rawCostThb > 0);
	if (!ok.length) return null;
	const clamp = (x: number) => Math.min(1.15, Math.max(0.85, x));
	const kwhFactor = clamp(ok.reduce((t, p) => t + p.meaKwh, 0) / ok.reduce((t, p) => t + p.rawImportKwh, 0));
	const priceFactor = clamp(
		ok.reduce((t, p) => t + (p.meaThb - serviceThb), 0) / ok.reduce((t, p) => t + p.rawCostThb * kwhFactor, 0),
	);
	return { kwhFactor, priceFactor, source: "receipts", cycles: ok.length };
}

/** Apply a calibration: imported kWh × kwhFactor; cost and savings × both (same tariff) */
export function calibrate(s: Summary, c: Calibration): Summary {
	const money = c.kwhFactor * c.priceFactor;
	return {
		...s,
		importKwh: s.importKwh * c.kwhFactor,
		peakImportKwh: s.peakImportKwh * c.kwhFactor,
		offPeakImportKwh: s.offPeakImportKwh * c.kwhFactor,
		costThb: s.costThb * money,
		savingsThb: s.savingsThb * c.priceFactor,
	};
}

// ---------------- insights ----------------

export interface SolarWindow {
	from: number;
	to: number;
	avgSolarKw: number;
	/** share of the usual load in that window that solar would cover, 0–100 */
	coverPct: number;
}

/**
 * The sunniest `hours`-long stretch: when running the washer, iron or AC costs least.
 * Consecutive buckets only; null when the stretch would produce under 0.2 kW.
 */
export function bestSolarWindow(buckets: Bucket[], hours = 3): SolarWindow | null {
	const n = hours * 4;
	if (buckets.length < n) return null;
	let best = -1;
	let bestSum = -1;
	for (let i = 0; i + n <= buckets.length; i++) {
		if (buckets[i + n - 1].t - buckets[i].t !== (n - 1) * SLOT_MS) continue;
		let s = 0;
		for (let k = i; k < i + n; k++) s += buckets[k].solar;
		if (s > bestSum) {
			bestSum = s;
			best = i;
		}
	}
	if (best < 0 || bestSum / n < 0.2) return null;
	const win = buckets.slice(best, best + n);
	const load = win.reduce((t, b) => t + b.load, 0);
	const self = win.reduce((t, b) => t + Math.min(b.solar, b.load), 0);
	return {
		from: win[0].t,
		to: win[n - 1].t + SLOT_MS,
		avgSolarKw: bestSum / n,
		coverPct: load > 0 ? Math.round((self / load) * 100) : 100,
	};
}

/**
 * Scale the imported energy (and its cost) by a meter-calibration factor. 15-min average
 * power summed × 0.25 drifts a few % from the meter's own daily totals.
 */
export function scaleImport(s: Summary, factor: number): Summary {
	return {
		...s,
		importKwh: s.importKwh * factor,
		peakImportKwh: s.peakImportKwh * factor,
		offPeakImportKwh: s.offPeakImportKwh * factor,
		costThb: s.costThb * factor,
	};
}

/**
 * meter import ÷ bucket-sum import over days that have both, clamped to ±10% so a bad
 * day can't distort the bill. 1 when there's nothing to compare.
 */
export function importCalibration(buckets: Bucket[], meterImportByDay: Map<string, number>): number {
	const perDay = new Map<string, { imp: number; n: number }>();
	for (const b of buckets) {
		if (b.est) continue;
		const d = bkk(b.t).date;
		const a = perDay.get(d) ?? { imp: 0, n: 0 };
		a.imp += Math.max(0, b.load - b.solar) * 0.25;
		a.n++;
		perDay.set(d, a);
	}
	let meter = 0;
	let sum = 0;
	for (const [d, a] of perDay) {
		const m = meterImportByDay.get(d);
		if (m === undefined || a.n < 96 || a.imp <= 0) continue;
		meter += m;
		sum += a.imp;
	}
	if (sum <= 0) return 1;
	return Math.min(1.1, Math.max(0.9, meter / sum));
}

/**
 * What a battery charged off-peak could save: weekday on-peak imports after solar, shifted
 * to off-peak at 90% round-trip efficiency, sized to the median day.
 */
export function batteryPotential(
	history: Bucket[],
	tariff: Tariff,
): { kwhPerWeekday: number; thbPerMonth: number } | null {
	const perDay = new Map<string, number>();
	for (const b of history) {
		if (b.est || !isPeak(b.t)) continue;
		const d = bkk(b.t).date;
		perDay.set(d, (perDay.get(d) ?? 0) + Math.max(0, b.load - b.solar) * 0.25);
	}
	const vals = [...perDay.values()].sort((a, b) => a - b);
	if (vals.length < 3) return null;
	const median = vals[Math.floor(vals.length / 2)];
	const perKwh = tariff.peak - tariff.offPeak / 0.9;
	return { kwhPerWeekday: median, thbPerMonth: median * perKwh * 22 };
}
