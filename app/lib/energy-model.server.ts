/**
 * Builds everything the /energy page shows, from BlueRing (measured) + Open-Meteo (weather),
 * via the pure engine in energy-forecast.ts.
 *
 * Caching (RATE_LIMIT_KV):
 *   past days of 15-min buckets  forever (120 d TTL); a finished day never changes
 *   weather                      30 min
 *   the assembled view           10 min; the 15-minute cron rebuilds it, so page loads stay warm
 */
import {
	type BlueringEnv,
	getEnergiesRange,
	getPlant,
	getSnapshot,
	type LiveReading,
	type PlantInfo,
	type RawEnergy,
} from "./bluering.server";
import {
	addDays,
	addSummaries,
	batteryPotential,
	bestSolarWindow,
	billingCycle,
	type Bucket,
	bkk,
	buildProfiles,
	DAY_MS,
	dayStart,
	fillGaps,
	fitSolarModel,
	forecastBuckets,
	hourlySolarKwh,
	importCalibration,
	HOUR_MS,
	SLOT_MS,
	type Summary,
	scaleImport,
	summarize,
	type SolarWindow,
	type Tariff,
	type WeatherHour,
} from "./energy-forecast";

const LAT = 13.8225;
const LON = 100.406;
/** days of history the solar fit and load profiles learn from */
const LEARN_DAYS = 21;
const FORECAST_DAYS = 7;
/** MEA TOU monthly service charge 38.22 + VAT 7% */
const SERVICE_THB = 40.9;

const VIEW_KV_KEY = "energy:v2:view";
const VIEW_TTL_SEC = 600;
const WEATHER_KV_KEY = "energy:v2:weather";
const WEATHER_TTL_SEC = 1800;
const dayKey = (gid: number, date: string) => `energy:bluering:min:${gid}:${date}`;
const DAY_TTL_SEC = 120 * 86400;

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

export interface EnergyView {
	generatedAt: number;
	plant: PlantInfo;
	tariff: Tariff;
	live: LiveReading | null;
	liveAgeSec: number | null;
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
		packageThb: number | null;
		/** projected solar savings − lease fee, for this cycle */
		netThb: number | null;
		/** share of elapsed buckets that were measured, not filled, % */
		coveragePct: number;
	};
	history: {
		daily: { date: string; solar: number; consumption: number; gridPurchased: number; gridSold: number }[];
		monthly: { month: string; solar: number; consumption: number; gridPurchased: number; gridSold: number }[];
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
		/** last 30 days of solar savings, scaled to a 30-day month */
		solarValuePerMonthThb: number | null;
	};
	tokenExpiresAt: number | null;
}

// ---------------- data sources ----------------

function toBucket(r: RawEnergy): Bucket | null {
	const t = Date.parse(r.deviceTime ?? "");
	if (!Number.isFinite(t)) return null;
	return { t, solar: r.solar ?? 0, load: r.consumption ?? 0 };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** 15-min buckets for Bangkok days [from, today], past days from KV when cached */
async function getBuckets(env: BlueringEnv, kv: KVNamespace | undefined, gid: number, from: string, today: string) {
	const out: Bucket[] = [];
	const missing: string[] = [];
	for (let d = from; d < today; d = addDays(d, 1)) {
		const hit = await kv?.get<[number, number, number][]>(dayKey(gid, d), "json");
		if (hit) for (const [t, solar, load] of hit) out.push({ t, solar, load });
		else missing.push(d);
	}
	// fetch missing past days in contiguous runs, then cache each finished day
	let i = 0;
	while (i < missing.length) {
		let j = i;
		while (j + 1 < missing.length && missing[j + 1] === addDays(missing[j], 1)) j++;
		const rows = await getEnergiesRange(env, gid, "minute", missing[i], addDays(missing[j], 1));
		const byDay = new Map<string, Bucket[]>();
		for (const r of rows) {
			const b = toBucket(r);
			if (!b) continue;
			const d = bkk(b.t).date;
			(byDay.get(d) ?? byDay.set(d, []).get(d)!).push(b);
		}
		for (let k = i; k <= j; k++) {
			const day = byDay.get(missing[k]) ?? [];
			out.push(...day);
			// only cache a complete day, so a gateway outage gets retried next build
			if (day.length >= 96) {
				await kv?.put(dayKey(gid, missing[k]), JSON.stringify(day.map((b) => [b.t, round3(b.solar), round3(b.load)])), {
					expirationTtl: DAY_TTL_SEC,
				});
			}
		}
		i = j + 1;
	}
	// today is always live
	const todayRows = await getEnergiesRange(env, gid, "minute", today, addDays(today, 1));
	for (const r of todayRows) {
		const b = toBucket(r);
		if (b) out.push(b);
	}
	// de-dupe (a range can return the boundary bucket twice) and sort
	return [...new Map(out.map((b) => [b.t, b])).values()].sort((a, b) => a.t - b.t);
}

async function getWeather(kv: KVNamespace | undefined): Promise<WeatherHour[]> {
	const hit = await kv?.get<WeatherHour[]>(WEATHER_KV_KEY, "json");
	if (hit) return hit;
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
	await kv?.put(WEATHER_KV_KEY, JSON.stringify(hours), { expirationTtl: WEATHER_TTL_SEC });
	return hours;
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

	const [buckets, weather, snapshot, dailyRows, monthlyRows] = await Promise.all([
		getBuckets(env, kv, gid, historyFrom, today),
		getWeather(kv),
		getSnapshot(env, kv, now),
		getEnergiesRange(env, gid, "daily", addDays(today, -60)),
		getEnergiesRange(env, gid, "monthly"),
	]);

	// learn only from finished days in the window
	const todayStart = dayStart(today);
	const learnStart = dayStart(learnFrom);
	const learnBuckets = buckets.filter((b) => b.t >= learnStart && b.t < todayStart);
	const model = fitSolarModel(hourlySolarKwh(learnBuckets), weather, plant.capKw);
	const profiles = buildProfiles(learnBuckets);
	const weatherByHour = new Map(weather.map((w) => [w.t, w]));
	const meterImport = new Map(
		dailyRows.filter((r) => r.date).map((r) => [bkk(Date.parse(r.date!)).date, r.gridPurchased] as const),
	);
	const factor = importCalibration(learnBuckets, meterImport);
	const sum = (bs: Bucket[]) => scaleImport(summarize(bs, tariff), factor);

	// "now" for the model = end of the last measured bucket today
	const todayMeasured = buckets.filter((b) => b.t >= todayStart);
	const lastT = todayMeasured.at(-1)?.t;
	const measuredEnd = lastT !== undefined ? lastT + SLOT_MS : Math.min(now - (now % SLOT_MS), todayStart);

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

	// ---- billing cycle: measured to date (gaps filled) + forecast to the end ----
	const cycleStart = dayStart(cycle.start);
	const cycleEnd = dayStart(cycle.end);
	const elapsed = fillGaps(buckets, cycleStart, measuredEnd, model, weatherByHour, profiles);
	const rest = forecastBuckets(measuredEnd, cycleEnd, model, weatherByHour, profiles);
	const cycleActual = sum(elapsed);
	const cycleProjected = addSummaries(cycleActual, sum(rest));
	const packageThb = plant.packageMonthlyThb;

	// ---- insights ----
	const last30 = buckets.filter((b) => b.t >= dayStart(addDays(today, -30)) && b.t < todayStart);
	const last30Days = new Set(last30.map((b) => bkk(b.t).date)).size;
	const solarValuePerMonthThb = last30Days >= 7 ? (summarize(last30, tariff).savingsThb / last30Days) * 30 : null;

	const sumPoint = (b: Bucket): ChartPoint => ({ t: b.t, solar: round3(b.solar), load: round3(b.load), est: !!b.est });

	return {
		generatedAt: now,
		plant,
		tariff,
		live: snapshot.live,
		liveAgeSec: snapshot.ageSec,
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
			billSoFarThb: r2(cycleActual.costThb + tariff.serviceThb),
			projectedBillThb: r2(cycleProjected.costThb + tariff.serviceThb),
			packageThb,
			netThb: packageThb !== null ? r2(cycleProjected.savingsThb - packageThb) : null,
			coveragePct: elapsed.length ? Math.round(((elapsed.length - cycleActual.estimatedBuckets) / elapsed.length) * 100) : 0,
		},
		history: {
			daily: dailyRows
				.filter((r) => r.date)
				.map((r) => ({
					date: bkk(Date.parse(r.date!)).date,
					solar: r2(r.solar),
					consumption: r2(r.consumption),
					gridPurchased: r2(r.gridPurchased),
					gridSold: r2(r.gridSold),
				}))
				.sort((a, b) => a.date.localeCompare(b.date)),
			monthly: monthlyRows
				.filter((r) => r.date)
				.map((r) => ({
					// monthly rows are stamped at UTC midnight of the 1st
					month: r.date!.slice(0, 7),
					solar: r2(r.solar),
					consumption: r2(r.consumption),
					gridPurchased: r2(r.gridPurchased),
					gridSold: r2(r.gridSold),
				}))
				.sort((a, b) => a.month.localeCompare(b.month)),
		},
		model: {
			kGlobal: model.kGlobal,
			learnedPr: r2((model.kGlobal * 1000) / plant.capKw),
			importFactor: Math.round(factor * 1000) / 1000,
			days: model.days,
			mapePct: model.mapePct === null ? null : Math.round(model.mapePct),
			backtest: model.backtest.slice(-14).map((b) => ({ date: b.date, actualKwh: r2(b.actualKwh), predictedKwh: r2(b.predictedKwh) })),
		},
		insights: {
			battery: batteryPotential(last30, tariff),
			solarValuePerMonthThb: solarValuePerMonthThb === null ? null : Math.round(solarValuePerMonthThb),
		},
		tokenExpiresAt: snapshot.tokenExpiresAt,
	};
}

/** Cached view (10 min). `force` rebuilds — the cron uses it to keep the cache warm. */
export async function getView(env: BlueringEnv, kv: KVNamespace | undefined, force = false): Promise<EnergyView> {
	if (!force) {
		const hit = await kv?.get<EnergyView>(VIEW_KV_KEY, "json");
		if (hit) return hit;
	}
	const view = await buildView(env, kv);
	await kv?.put(VIEW_KV_KEY, JSON.stringify(view), { expirationTtl: VIEW_TTL_SEC });
	return view;
}
