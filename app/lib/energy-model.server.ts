/**
 * Builds everything the /energy page shows, from BlueRing (measured) + Open-Meteo (weather),
 * via the pure engine in energy-forecast.ts.
 *
 * Caching (RATE_LIMIT_KV), sized for the free plan's 1,000 writes/day:
 *   15-min buckets of a past day   one key per day, kept 120 d; written once per day
 *   per-day summaries since install one key; written only when a new day is finished
 *   weather                        fresh 30 min, served stale up to 12 h if Open-Meteo fails
 *   the assembled view             fresh 5 min, served stale up to 3 d if a rebuild fails
 *                                  (token expired, BlueRing down); the 15-minute cron
 *                                  rebuilds it so page loads stay warm
 */
import {
	bangkokMidnightIso,
	type BlueringEnv,
	BlueringAuthError,
	getAllPages,
	getEnergiesRange,
	getPlant,
	type LiveReading,
	type PlantInfo,
	type RawEnergy,
	type RawPerformanceMinute,
	tokenExpiry,
	toLive,
} from "./bluering.server";
import {
	addDays,
	addSummaries,
	batteryPotential,
	bestSolarWindow,
	billingCycle,
	billSpread,
	type Bucket,
	bkk,
	buildProfiles,
	cyclesSince,
	DAY_MS,
	dayStart,
	daySummaries,
	emptySummary,
	fillGaps,
	fitSolarModel,
	forecastBuckets,
	HOUR_MS,
	hourlySolarKwh,
	importCalibration,
	SLOT_MS,
	type SolarWindow,
	type Summary,
	scaleImport,
	summarize,
	pricingSignature,
	type Tariff,
	touHolidaysVerified,
	type WeatherHour,
} from "./energy-forecast";

const LAT = 13.8225;
const LON = 100.406;
/** days of history the solar fit and load profiles learn from */
const LEARN_DAYS = 21;
const FORECAST_DAYS = 7;
/** MEA TOU monthly service charge 38.22 + VAT 7% */
const SERVICE_THB = 40.9;
/** no new bucket for this long = gateway probably offline (normal lag is ≤ 20 min) */
const GATEWAY_SILENT_MIN = 45;

/** bump the suffix whenever EnergyView's shape changes, so an old cached view is never served */
const VIEW_KV_KEY = "energy:v2:view:4";
const VIEW_FRESH_MS = 5 * 60_000;
const VIEW_TTL_SEC = 3 * 86400;
const WEATHER_KV_KEY = "energy:v2:weather";
const WEATHER_FRESH_MS = 30 * 60_000;
const WEATHER_TTL_SEC = 12 * 3600;
const dayKey = (gid: number, date: string) => `energy:bluering:min:${gid}:${date}`;
const DAY_TTL_SEC = 120 * 86400;
/** keyed by pricing too: new rates or a new holiday year re-price every stored day */
const daySumsKey = (gid: number, t: Tariff) => `energy:v2:daysums:${gid}:${pricingSignature(t)}`;
/** at most this many old days fetched per build (≈10 BlueRing pages) */
const BACKFILL_DAYS_PER_BUILD = 20;

// ---------------- view types (serialised to the page) ----------------

export interface ChartPoint {
	t: number;
	solar: number;
	load: number;
	est: boolean;
}

export interface DayForecast {
	date: string;
	solarKwh: number;
	loadKwh: number;
	importKwh: number;
	exportKwh: number;
	costThb: number;
	savingsThb: number;
	selfPoweredPct: number;
	/** mean cloud cover 08:00–16:00, % */
	cloudPct: number | null;
	maxTempC: number | null;
	peakSolarKw: number;
	/** sunniest 3 hours (for today: of what's left of the day) */
	window: SolarWindow | null;
	/** true for today: part measured, part forecast */
	partial: boolean;
}

/** One billing cycle, computed from BlueRing's 15-min data at the TOU rates */
export interface CycleRow {
	start: string;
	/** exclusive */
	end: string;
	days: number;
	/** days with measured data in the cycle (the first cycle starts at install) */
	measuredDays: number;
	loadKwh: number;
	importKwh: number;
	peakImportKwh: number;
	offPeakImportKwh: number;
	solarKwh: number;
	billThb: number;
	savingsThb: number;
	/** savings − lease fee; null without a lease */
	netThb: number | null;
	/** the running cycle: measured so far + forecast */
	projected: boolean;
}

export interface EnergyView {
	generatedAt: number;
	plant: PlantInfo;
	tariff: Tariff;
	live: LiveReading | null;
	status: {
		/** end of the newest measured bucket, ms */
		lastDataT: number | null;
		/** true when the gateway hasn't delivered for GATEWAY_SILENT_MIN */
		gatewaySilent: boolean;
		/** years in the cycle/outlook whose MEA off-peak holiday calendar isn't in TOU_HOLIDAYS */
		unverifiedHolidayYears: number[];
	};
	today: { date: string; points: ChartPoint[]; actual: Summary; projected: Summary; nowT: number };
	week: DayForecast[];
	cycle: {
		start: string;
		end: string;
		days: number;
		elapsedDays: number;
		actual: Summary;
		projected: Summary;
		billSoFarThb: number;
		projectedBillThb: number;
		/** ± half-width of the likely range for the projected bill */
		spreadThb: number;
		previousBillThb: number | null;
		packageThb: number | null;
		/** projected solar savings − lease fee, for this cycle */
		netThb: number | null;
		/** share of elapsed buckets that were measured, not filled, % */
		coveragePct: number;
	};
	cycles: CycleRow[];
	history: {
		daily: { date: string; solar: number; consumption: number; gridPurchased: number; gridSold: number }[];
	};
	model: {
		kGlobal: number;
		/** kWh per kWp at 1000 W/m², i.e. the learned performance ratio */
		learnedPr: number;
		/** meter ÷ 15-min-sum for imported kWh, applied to every import/cost figure */
		importFactor: number;
		days: number;
		mapePct: number | null;
		backtest: { date: string; actualKwh: number; predictedKwh: number }[];
	};
	insights: {
		battery: { kwhPerWeekday: number; thbPerMonth: number } | null;
	};
	tokenExpiresAt: number | null;
	/** set when this is the last good view, served because a rebuild failed */
	stale?: { reason: "token_expired" | "error"; at: number };
}

// ---------------- data sources ----------------

function toBucket(r: RawEnergy): Bucket | null {
	const t = Date.parse(r.deviceTime ?? "");
	if (!Number.isFinite(t)) return null;
	return { t, solar: r.solar ?? 0, load: r.consumption ?? 0 };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function groupByDay(rows: RawEnergy[]): Map<string, Bucket[]> {
	const byDay = new Map<string, Bucket[]>();
	for (const r of rows) {
		const b = toBucket(r);
		if (!b) continue;
		const d = bkk(b.t).date;
		(byDay.get(d) ?? byDay.set(d, []).get(d)!).push(b);
	}
	return byDay;
}

/** contiguous runs of consecutive dates: ["a","b","d"] → [["a","b"],["d"]] */
function runs(dates: string[]): string[][] {
	const out: string[][] = [];
	for (const d of dates) {
		const last = out.at(-1);
		if (last && addDays(last.at(-1)!, 1) === d) last.push(d);
		else out.push([d]);
	}
	return out;
}

/** 15-min buckets for Bangkok days [from, today], past days from KV when cached */
async function getBuckets(env: BlueringEnv, kv: KVNamespace | undefined, gid: number, from: string, today: string) {
	const out: Bucket[] = [];
	const missing: string[] = [];
	const dates: string[] = [];
	for (let d = from; d < today; d = addDays(d, 1)) dates.push(d);
	const cached = await Promise.all(dates.map((d) => kv?.get<[number, number, number][]>(dayKey(gid, d), "json") ?? null));
	dates.forEach((d, i) => {
		const hit = cached[i];
		if (hit) for (const [t, solar, load] of hit) out.push({ t, solar, load });
		else missing.push(d);
	});
	for (const run of runs(missing)) {
		const byDay = groupByDay(await getEnergiesRange(env, gid, "minute", run[0], addDays(run.at(-1)!, 1)));
		for (const d of run) {
			const day = byDay.get(d) ?? [];
			out.push(...day);
			// only cache a complete day, so a gateway outage gets retried next build
			if (day.length >= 96) {
				await kv?.put(dayKey(gid, d), JSON.stringify(day.map((b) => [b.t, round3(b.solar), round3(b.load)])), {
					expirationTtl: DAY_TTL_SEC,
				});
			}
		}
	}
	const todayRows = await getEnergiesRange(env, gid, "minute", today, addDays(today, 1));
	for (const r of todayRows) {
		const b = toBucket(r);
		if (b) out.push(b);
	}
	// de-dupe (a range can return the boundary bucket twice) and sort
	return [...new Map(out.map((b) => [b.t, b])).values()].sort((a, b) => a.t - b.t);
}

/**
 * Per-day summaries for every finished day since install, kept in one KV key. Days already
 * in `buckets` are summarised from them; older missing days are fetched in contiguous runs.
 * A day is stored once complete (96 buckets) or once it's 3+ days old (an outage that long
 * won't be backfilled). Summaries are unscaled; the meter factor is applied at read time.
 */
async function getDaySums(
	env: BlueringEnv,
	kv: KVNamespace | undefined,
	gid: number,
	installDate: string,
	today: string,
	buckets: Bucket[],
	tariff: Tariff,
): Promise<Map<string, Summary>> {
	const stored = (await kv?.get<Record<string, Summary>>(daySumsKey(gid, tariff), "json")) ?? {};
	// an empty day is never trusted from storage (it may be a failed fetch); refetch it
	const sums = new Map(Object.entries(stored).filter(([, v]) => v.buckets > 0));
	const purged = sums.size !== Object.keys(stored).length;
	const fromBuckets = daySummaries(buckets, tariff);
	const settled = addDays(today, -3);
	/** complete, or settled with at least some data (a long outage won't be backfilled) */
	const keepable = (d: string, s: Summary) => s.buckets >= 96 || (d < settled && s.buckets > 0);
	let changed = false;
	const missing: string[] = [];
	for (let d = installDate; d < today; d = addDays(d, 1)) {
		if (sums.has(d)) continue;
		const s = fromBuckets.get(d);
		if (!s) {
			missing.push(d);
			continue;
		}
		sums.set(d, s); // a recent incomplete day is used now but only stored once settled
		if (keepable(d, s)) changed = true;
	}
	// newest first, capped: keeps a cold build under the free plan's 50 subrequests; the
	// cron fills the rest within a few runs
	for (const run of runs(missing.slice(-BACKFILL_DAYS_PER_BUILD))) {
		const byDay = groupByDay(await getEnergiesRange(env, gid, "minute", run[0], addDays(run.at(-1)!, 1)));
		for (const d of run) {
			const day = byDay.get(d);
			if (!day?.length) continue; // no data (outage or a failed fetch): leave it missing
			const s = summarize(day, tariff);
			sums.set(d, s);
			if (keepable(d, s)) changed = true;
		}
	}
	if (changed || purged) {
		const keep: Record<string, Summary> = {};
		for (const [d, s] of sums) {
			if (keepable(d, s)) keep[d] = roundSummary(s);
		}
		await kv?.put(daySumsKey(gid, tariff), JSON.stringify(keep));
	}
	return sums;
}

function roundSummary(s: Summary): Summary {
	const out = { ...s };
	for (const k of Object.keys(out) as (keyof Summary)[]) out[k] = Math.round(out[k] * 1000) / 1000;
	return out;
}

/** Weather: fresh 30 min; if Open-Meteo fails, the last copy (≤ 12 h) rather than nothing */
async function getWeather(kv: KVNamespace | undefined, now: number): Promise<WeatherHour[]> {
	const hit = await kv?.get<{ at: number; hours: WeatherHour[] }>(WEATHER_KV_KEY, "json");
	if (hit && now - hit.at < WEATHER_FRESH_MS) return hit.hours;
	try {
		const url =
			"https://api.open-meteo.com/v1/forecast" +
			`?latitude=${LAT}&longitude=${LON}` +
			"&hourly=shortwave_radiation,cloud_cover,temperature_2m" +
			`&timezone=Asia%2FBangkok&past_days=${LEARN_DAYS + 1}&forecast_days=${FORECAST_DAYS + 1}`;
		const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) throw new Error(`open-meteo ${res.status}`);
		const j = (await res.json()) as {
			hourly: { time: string[]; shortwave_radiation: (number | null)[]; cloud_cover: (number | null)[]; temperature_2m: (number | null)[] };
		};
		const H = j.hourly;
		// time is the hour END in Bangkok time; radiation is the mean over the preceding hour
		const hours: WeatherHour[] = H.time.map((time, i) => ({
			t: Date.parse(`${time}:00+07:00`) - HOUR_MS,
			ghi: H.shortwave_radiation[i] ?? 0,
			cloud: H.cloud_cover[i] ?? 0,
			temp: H.temperature_2m[i] ?? 0,
		}));
		await kv?.put(WEATHER_KV_KEY, JSON.stringify({ at: now, hours }), { expirationTtl: WEATHER_TTL_SEC });
		return hours;
	} catch (e) {
		console.error("[energy-view] weather:", e instanceof Error ? e.message : String(e));
		// with no weather at all, forecasts fall back to the measured solar climatology
		return hit?.hours ?? [];
	}
}

/** Newest 15-min reading today, straight from BlueRing (no KV write) */
async function getLiveReading(env: BlueringEnv, gid: number, today: string): Promise<LiveReading | null> {
	const rows = await getAllPages<RawPerformanceMinute>(
		env,
		`/gateways/${gid}/performances?period=minutes&startDate=${encodeURIComponent(bangkokMidnightIso(today))}`,
	);
	const last = rows.reduce<RawPerformanceMinute | null>((a, b) => (!a || b.date > a.date ? b : a), null);
	return last ? toLive(last) : null;
}

// ---------------- assembly ----------------

export async function buildView(env: BlueringEnv, kv: KVNamespace | undefined, now = Date.now()): Promise<EnergyView> {
	const plant = await getPlant(env, kv);
	const gid = plant.gatewayId;
	const tariff: Tariff = {
		peak: plant.tariff.peakThbPerKwh,
		offPeak: plant.tariff.offPeakThbPerKwh,
		sale: plant.tariff.saleThbPerKwh,
		serviceThb: SERVICE_THB,
	};
	const today = bkk(now).date;
	const cycle = billingCycle(today, plant.meterReadingDay);
	const learnFrom = addDays(today, -LEARN_DAYS);
	const historyFrom = cycle.start < learnFrom ? cycle.start : learnFrom;

	const [buckets, weather, live, dailyRows] = await Promise.all([
		getBuckets(env, kv, gid, historyFrom, today),
		getWeather(kv, now),
		getLiveReading(env, gid, today),
		getEnergiesRange(env, gid, "daily"), // everything since install (~100 rows)
	]);
	const daily = dailyRows
		.filter((r) => r.date)
		.map((r) => ({
			date: bkk(Date.parse(r.date!)).date,
			solar: r2(r.solar),
			consumption: r2(r.consumption),
			gridPurchased: r2(r.gridPurchased),
			gridSold: r2(r.gridSold),
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
	const installDate = daily[0]?.date ?? historyFrom;

	// learn only from finished days in the window
	const todayStart = dayStart(today);
	const learnStart = dayStart(learnFrom);
	const learnBuckets = buckets.filter((b) => b.t >= learnStart && b.t < todayStart);
	const model = fitSolarModel(hourlySolarKwh(learnBuckets), weather, plant.capKw);
	const profiles = buildProfiles(learnBuckets);
	const weatherByHour = new Map(weather.map((w) => [w.t, w]));
	const factor = importCalibration(learnBuckets, new Map(daily.map((d) => [d.date, d.gridPurchased] as const)));
	const sum = (bs: Bucket[]) => scaleImport(summarize(bs, tariff), factor);

	// "now" for the model = end of the last measured bucket today
	const lastT = buckets.filter((b) => b.t >= todayStart).at(-1)?.t;
	const measuredEnd = lastT !== undefined ? lastT + SLOT_MS : todayStart;
	const lastDataT = buckets.length ? buckets.at(-1)!.t + SLOT_MS : null;

	// ---- today: measured so far + forecast for the rest ----
	const todayActual = fillGaps(buckets, todayStart, measuredEnd, model, weatherByHour, profiles);
	const todayRest = forecastBuckets(measuredEnd, todayStart + DAY_MS, model, weatherByHour, profiles);
	const todayActualSum = sum(todayActual);
	const todayProjected = addSummaries(todayActualSum, sum(todayRest));

	// ---- 7-day outlook ----
	const week: DayForecast[] = [];
	for (let i = 0; i < FORECAST_DAYS; i++) {
		const date = addDays(today, i);
		const start = dayStart(date);
		const day = i === 0 ? [...todayActual, ...todayRest] : forecastBuckets(start, start + DAY_MS, model, weatherByHour, profiles);
		const s = sum(day);
		const daylight = weather.filter((w) => w.t >= start + 8 * HOUR_MS && w.t < start + 16 * HOUR_MS);
		const allDay = weather.filter((w) => w.t >= start && w.t < start + DAY_MS);
		week.push({
			date,
			solarKwh: r2(s.solarKwh),
			loadKwh: r2(s.loadKwh),
			importKwh: r2(s.importKwh),
			exportKwh: r2(s.exportKwh),
			costThb: r2(s.costThb),
			savingsThb: r2(s.savingsThb),
			selfPoweredPct: Math.round(s.selfPoweredPct),
			cloudPct: daylight.length ? Math.round(daylight.reduce((t, w) => t + w.cloud, 0) / daylight.length) : null,
			maxTempC: allDay.length ? Math.round(Math.max(...allDay.map((w) => w.temp))) : null,
			peakSolarKw: r2(Math.max(0, ...day.map((b) => b.solar))),
			window: bestSolarWindow(i === 0 ? todayRest : day),
			partial: i === 0,
		});
	}

	// ---- running billing cycle: measured to date (gaps filled) + forecast to the end ----
	const cycleStart = dayStart(cycle.start);
	const cycleEnd = dayStart(cycle.end);
	const elapsed = fillGaps(buckets, Math.max(cycleStart, dayStart(installDate)), measuredEnd, model, weatherByHour, profiles);
	const rest = forecastBuckets(measuredEnd, cycleEnd, model, weatherByHour, profiles);
	const cycleActual = sum(elapsed);
	const cycleProjected = addSummaries(cycleActual, sum(rest));
	const packageThb = plant.packageMonthlyThb;

	// ---- every past cycle since install, from per-day summaries ----
	const daySums = await getDaySums(env, kv, gid, installDate, today, buckets, tariff);
	const cycles: CycleRow[] = cyclesSince(installDate, today, plant.meterReadingDay).map((c) => {
		if (c.start === cycle.start) {
			return {
				start: c.start,
				end: c.end,
				days: c.days,
				measuredDays: Math.round((measuredEnd - Math.max(cycleStart, dayStart(installDate))) / DAY_MS),
				loadKwh: r2(cycleProjected.loadKwh),
				importKwh: r2(cycleProjected.importKwh),
				peakImportKwh: r2(cycleProjected.peakImportKwh),
				offPeakImportKwh: r2(cycleProjected.offPeakImportKwh),
				solarKwh: r2(cycleProjected.solarKwh),
				billThb: r2(cycleProjected.costThb + SERVICE_THB),
				savingsThb: r2(cycleProjected.savingsThb),
				netThb: packageThb === null ? null : r2(cycleProjected.savingsThb - packageThb),
				projected: true,
			};
		}
		let s = emptySummary();
		let measuredDays = 0;
		for (let d = c.start; d < c.end; d = addDays(d, 1)) {
			const ds = daySums.get(d);
			if (!ds || ds.buckets === 0) continue;
			s = addSummaries(s, ds);
			measuredDays++;
		}
		s = scaleImport(s, factor);
		return {
			start: c.start,
			end: c.end,
			days: c.days,
			measuredDays,
			loadKwh: r2(s.loadKwh),
			importKwh: r2(s.importKwh),
			peakImportKwh: r2(s.peakImportKwh),
			offPeakImportKwh: r2(s.offPeakImportKwh),
			solarKwh: r2(s.solarKwh),
			billThb: r2(s.costThb + SERVICE_THB),
			savingsThb: r2(s.savingsThb),
			netThb: packageThb === null ? null : r2(s.savingsThb - packageThb),
			projected: false,
		};
	});
	const previous = cycles.length >= 2 ? cycles[cycles.length - 2] : null;

	// likely range: spread of daily cost over the learning window, √(days left)
	const dailyCosts: number[] = [];
	for (let d = learnFrom; d < today; d = addDays(d, 1)) {
		const ds = daySums.get(d);
		if (ds && ds.buckets >= 90) dailyCosts.push(ds.costThb * factor);
	}
	const spreadThb = billSpread(dailyCosts, (cycleEnd - measuredEnd) / DAY_MS);

	const sumPoint = (b: Bucket): ChartPoint => ({ t: b.t, solar: round3(b.solar), load: round3(b.load), est: !!b.est });
	const last30 = buckets.filter((b) => b.t >= dayStart(addDays(today, -30)) && b.t < todayStart);

	return {
		generatedAt: now,
		plant,
		tariff,
		live,
		status: {
			lastDataT,
			gatewaySilent: lastDataT === null || now - lastDataT > GATEWAY_SILENT_MIN * 60_000,
			unverifiedHolidayYears: [
				...new Set([cycle.start, addDays(cycle.end, -1), addDays(today, FORECAST_DAYS - 1)].map((d) => Number(d.slice(0, 4)))),
			].filter((y) => !touHolidaysVerified(y)),
		},
		today: {
			date: today,
			points: [...todayActual, ...todayRest].map(sumPoint),
			actual: todayActualSum,
			projected: todayProjected,
			nowT: measuredEnd,
		},
		week,
		cycle: {
			start: cycle.start,
			end: cycle.end,
			days: cycle.days,
			elapsedDays: (measuredEnd - cycleStart) / DAY_MS,
			actual: cycleActual,
			projected: cycleProjected,
			billSoFarThb: r2(cycleActual.costThb + SERVICE_THB),
			projectedBillThb: r2(cycleProjected.costThb + SERVICE_THB),
			spreadThb: Math.round(spreadThb),
			// a partial first cycle (install mid-cycle) isn't a fair comparison
			previousBillThb: previous && previous.measuredDays >= previous.days - 1 ? previous.billThb : null,
			packageThb,
			netThb: packageThb !== null ? r2(cycleProjected.savingsThb - packageThb) : null,
			coveragePct: elapsed.length ? Math.round(((elapsed.length - cycleActual.estimatedBuckets) / elapsed.length) * 100) : 0,
		},
		cycles,
		history: { daily: daily.slice(-61) },
		model: {
			kGlobal: model.kGlobal,
			learnedPr: r2((model.kGlobal * 1000) / plant.capKw),
			importFactor: Math.round(factor * 1000) / 1000,
			days: model.days,
			mapePct: model.mapePct === null ? null : Math.round(model.mapePct),
			backtest: model.backtest.slice(-14).map((b) => ({ date: b.date, actualKwh: r2(b.actualKwh), predictedKwh: r2(b.predictedKwh) })),
		},
		insights: { battery: batteryPotential(last30, tariff) },
		tokenExpiresAt: tokenExpiry(env.BLUERING_TOKEN ?? ""),
	};
}

/**
 * The view, fresh within 5 min. Older → rebuild; if the rebuild fails (token expired,
 * BlueRing or the network down), the last good view comes back marked `stale` instead of
 * an error page. Throws only when there is nothing cached at all. `force` (the cron)
 * always rebuilds.
 */
export async function getView(env: BlueringEnv, kv: KVNamespace | undefined, force = false, now = Date.now()): Promise<EnergyView> {
	const hit = await kv?.get<EnergyView>(VIEW_KV_KEY, "json");
	if (!force && hit && now - hit.generatedAt < VIEW_FRESH_MS) return hit;
	try {
		const view = await buildView(env, kv, now);
		await kv?.put(VIEW_KV_KEY, JSON.stringify(view), { expirationTtl: VIEW_TTL_SEC });
		return view;
	} catch (e) {
		if (!hit) throw e;
		console.error("[energy-view] rebuild failed, serving last good view:", e instanceof Error ? e.message : String(e));
		return { ...hit, stale: { reason: e instanceof BlueringAuthError ? "token_expired" : "error", at: now } };
	}
}
