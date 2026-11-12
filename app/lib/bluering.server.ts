/**
 * BlueRing Energy cloud client (rooftop PV: 4 × MI-1000 micro-inverters behind one gateway).
 *
 * The API is private and undocumented. It's mapped in docs/energy/bluering.md and every
 * shape below was confirmed against the live API on 2026-11-12. Auth is phone + SMS OTP,
 * which a Worker can't do, so the token comes from `node tools/bluering/bluering.mjs login`
 * on the Mac and is stored as the BLUERING_TOKEN secret (valid 30 days). When it expires,
 * every call throws BlueringAuthError until the owner logs in again.
 *
 * Endpoints a normal (non-admin) account can read:
 *   GET /users/me                                  → { id }
 *   GET /users/{uid}/plants                        → plant + gateway { id, daily*, inverters[] }
 *   GET /gateways/{gid}/performances?period=minutes|days|monthly&startDate=&limit=&offset=
 *       minutes rows: pvActivePower / gridActivePower (kW), gridVoltage, gridCurrent,
 *       dailyEnergyGeneration / dailyEnergyPurchased / dailyEnergySold (kWh so far today)
 *   GET /gateways/{gid}/energies?type=minute|daily|monthly&startDate=&limit=&offset=
 *       minute rows: solar / grid / consumption as average kW per 15-min bucket
 *       daily/monthly rows: solar / gridPurchased / gridSold / consumption in kWh
 * Data comes in 15-minute buckets and is uploaded about 5 minutes after each bucket ends.
 * Day boundaries are Bangkok midnight, sent as UTC ISO (2026-11-12 → 2026-11-11T17:00:00.000Z).
 * Pages default to 10 rows, so always pass limit/offset.
 */

export interface BlueringEnv {
	BLUERING_TOKEN?: string;
}

export const BLUERING_BASE = "https://bluering.workundercloud.com/api";

const SNAPSHOT_KV_KEY = "energy:bluering:snapshot";
const PLANT_KV_KEY = "energy:bluering:plant";
/** KV's minimum TTL. Data only changes every 15 min anyway. */
const SNAPSHOT_TTL_SEC = 60;
const PLANT_TTL_SEC = 6 * 3600;
const TIMEOUT_MS = 10_000;
/** waits (ms) before retrying a throttled (429) request */
const RETRY_429 = [1500, 4000];
const PAGE = 200;
const MAX_PAGES = 20;

export type SeriesType = "minute" | "daily" | "monthly";
export const SERIES_TYPES: readonly SeriesType[] = ["minute", "daily", "monthly"];

export class BlueringAuthError extends Error {
	constructor(message = "BlueRing token missing or expired — run: node tools/bluering/bluering.mjs login") {
		super(message);
		this.name = "BlueringAuthError";
	}
}

export class BlueringHttpError extends Error {
	status: number;
	path: string;
	constructor(status: number, path: string, message: string) {
		super(`BlueRing ${status} on ${path}: ${message}`);
		this.name = "BlueringHttpError";
		this.status = status;
		this.path = path;
	}
}

// ---------------- raw API shapes (confirmed 2026-11-12) ----------------

export interface RawPlant {
	id: number;
	name: string;
	type: string;
	status: string;
	/** "mea" | "pea" */
	eaType: string;
	/** "tou" | "normal" */
	meterType: string;
	meterReadingDate: number;
	grid: { purchasePrice: number; purchaseOffPeakPrice: number; salePrice: number };
	gatewayId: number;
	package?: { code: string; name: string } | null;
	gateway: {
		id: number;
		serialNumber: string;
		dailySolar: number;
		dailyGrid: number;
		dailyConsumption: number;
		inverters: { id: number; model: string; serialNumber: string; pvCount: number }[];
	};
}

export interface RawPerformanceMinute {
	date: string;
	pvActivePower: number;
	pvReactivePower: number;
	gridActivePower: number;
	gridVoltage: number;
	gridCurrent: number;
	dailyEnergyGeneration: number;
	dailyEnergySold: number;
	dailyEnergyPurchased: number;
}

export interface RawEnergy {
	solar: number;
	grid?: number;
	gridPurchased: number;
	gridSold: number;
	consumption: number;
	/** minute rows */
	deviceTime?: string;
	/** daily / monthly rows */
	date?: string;
}

// ---------------- pure helpers (unit-tested) ----------------

/** `exp` of a JWT in ms, or null when the token isn't a JWT */
export function tokenExpiry(token: string): number | null {
	const part = token.split(".")[1];
	if (!part) return null;
	try {
		const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
		const exp = (JSON.parse(json) as { exp?: unknown }).exp;
		return typeof exp === "number" ? exp * 1000 : null;
	} catch {
		return null;
	}
}

/** Bangkok calendar date (YYYY-MM-DD) → its midnight as UTC ISO, the form BlueRing's startDate wants */
export function bangkokMidnightIso(date: string): string {
	return new Date(`${date}T00:00:00+07:00`).toISOString();
}

export function bangkokToday(now = Date.now()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(now));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PlantInfo {
	plantId: number;
	gatewayId: number;
	name: string;
	eaType: string;
	meterType: string;
	meterReadingDay: number;
	tariff: { peakThbPerKwh: number; offPeakThbPerKwh: number; saleThbPerKwh: number };
	inverters: { model: string; pvCount: number }[];
	/** sum of inverter AC ratings (MI-1000 → 1 kW each) */
	capKw: number;
	/** solar-lease fee parsed from the package name ("… 1,399 บาท/เดือน …"), null if absent */
	packageMonthlyThb: number | null;
}

/** "MI-1000-2M0" → 1 kW; unknown models count as 1 kW */
export function inverterKw(model: string): number {
	const m = /(\d{3,5})/.exec(model);
	return m ? Number(m[1]) / 1000 : 1;
}

export function parsePackageFee(name: string | undefined | null): number | null {
	const m = /([\d,]+(?:\.\d+)?)\s*บาท\s*\/\s*เดือน/.exec(name ?? "");
	return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** Public subset of a plant: no serial numbers, lead number or package code */
export function toPlantInfo(p: RawPlant): PlantInfo {
	const inverters = p.gateway?.inverters ?? [];
	return {
		plantId: p.id,
		gatewayId: p.gatewayId ?? p.gateway.id,
		name: p.name,
		eaType: p.eaType,
		meterType: p.meterType,
		meterReadingDay: p.meterReadingDate,
		tariff: {
			peakThbPerKwh: p.grid.purchasePrice,
			offPeakThbPerKwh: p.grid.purchaseOffPeakPrice,
			saleThbPerKwh: p.grid.salePrice,
		},
		inverters: inverters.map((i) => ({ model: i.model, pvCount: i.pvCount })),
		capKw: inverters.length ? inverters.reduce((t, i) => t + inverterKw(i.model), 0) : 4,
		packageMonthlyThb: parsePackageFee(p.package?.name),
	};
}

export interface LiveReading {
	/** start of the 15-min bucket this reading describes */
	at: string;
	solarW: number;
	/** + importing from the grid, − exporting */
	gridW: number;
	/** solar + grid. The house load, assuming the battery-less micro-inverter setup. */
	homeW: number;
	gridVoltageV: number;
	gridCurrentA: number;
	today: {
		solarKwh: number;
		gridPurchasedKwh: number;
		gridSoldKwh: number;
		/** solar + purchased − sold */
		consumptionKwh: number;
		/** share of consumption covered by solar the house used itself, 0–100 */
		selfPoweredPct: number;
	};
}

export function toLive(row: RawPerformanceMinute): LiveReading {
	const solarW = Math.round(row.pvActivePower * 1000);
	const gridW = Math.round(row.gridActivePower * 1000);
	const solar = row.dailyEnergyGeneration;
	const bought = row.dailyEnergyPurchased;
	const sold = row.dailyEnergySold;
	const consumption = solar + bought - sold;
	return {
		at: row.date,
		solarW,
		gridW,
		homeW: Math.max(0, solarW + gridW),
		gridVoltageV: row.gridVoltage,
		gridCurrentA: row.gridCurrent,
		today: {
			solarKwh: r2(solar),
			gridPurchasedKwh: r2(bought),
			gridSoldKwh: r2(sold),
			consumptionKwh: r2(consumption),
			selfPoweredPct: consumption > 0 ? Math.round(((solar - sold) / consumption) * 100) : 0,
		},
	};
}

export interface SeriesPoint {
	t: string;
	solar: number;
	consumption: number;
	gridPurchased: number;
	gridSold: number;
	/** minute series only: net grid draw, kW */
	grid?: number;
}

export function toSeries(rows: RawEnergy[]): SeriesPoint[] {
	return rows
		.map((r) => ({
			t: r.deviceTime ?? r.date ?? "",
			solar: r2(r.solar),
			consumption: r2(r.consumption),
			gridPurchased: r2(r.gridPurchased),
			gridSold: r2(r.gridSold),
			...(r.grid !== undefined ? { grid: r2(r.grid) } : {}),
		}))
		.filter((p) => p.t)
		.sort((a, b) => a.t.localeCompare(b.t));
}

// ---------------- HTTP ----------------

export async function blueringGet<T = unknown>(env: BlueringEnv, path: string): Promise<T> {
	const token = env.BLUERING_TOKEN?.trim();
	if (!token) throw new BlueringAuthError();
	const exp = tokenExpiry(token);
	if (exp !== null && exp < Date.now()) throw new BlueringAuthError();

	let res: Response;
	for (let attempt = 0; ; attempt++) {
		res = await fetch(BLUERING_BASE + path, {
			headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		// NestJS throttler: back off briefly rather than failing a whole page build
		if (res.status !== 429 || attempt >= RETRY_429.length) break;
		await new Promise((r) => setTimeout(r, RETRY_429[attempt]));
	}
	const text = await res.text();
	let body: unknown = text;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		/* non-JSON body — keep the text */
	}
	if (res.status === 401) throw new BlueringAuthError();
	if (!res.ok) {
		const msg = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : text.slice(0, 200);
		throw new BlueringHttpError(res.status, path, msg);
	}
	return body as T;
}

/**
 * Follow limit/offset paging until a short page (BlueRing defaults to 10 rows). Throws
 * rather than return a silently truncated list when MAX_PAGES is hit: a partial range
 * would otherwise be summarised and cached as if the missing days had no data.
 */
export async function getAllPages<T>(env: BlueringEnv, pathWithQuery: string): Promise<T[]> {
	const out: T[] = [];
	const sep = pathWithQuery.includes("?") ? "&" : "?";
	for (let page = 0; page < MAX_PAGES; page++) {
		const rows = await blueringGet<T[]>(env, `${pathWithQuery}${sep}limit=${PAGE}&offset=${page * PAGE}`);
		if (!Array.isArray(rows)) return out;
		out.push(...rows);
		if (rows.length < PAGE) return out;
	}
	throw new Error(`BlueRing: more than ${MAX_PAGES * PAGE} rows for ${pathWithQuery}; request a shorter range`);
}

// ---------------- resources ----------------

/** The account's first plant (cached 6 h). The user id comes from /users/me. */
export async function getPlant(env: BlueringEnv, kv?: KVNamespace): Promise<PlantInfo> {
	const hit = await kv?.get<PlantInfo>(PLANT_KV_KEY, "json");
	if (hit) return hit;
	const me = await blueringGet<{ id: number }>(env, "/users/me");
	const plants = await blueringGet<RawPlant[]>(env, `/users/${me.id}/plants`);
	if (!Array.isArray(plants) || !plants[0]) throw new Error("BlueRing: no plant on this account");
	const info = toPlantInfo(plants[0]);
	await kv?.put(PLANT_KV_KEY, JSON.stringify(info), { expirationTtl: PLANT_TTL_SEC });
	return info;
}

/**
 * Energies rows for Bangkok days [fromDate, toDate). BlueRing treats endDate as inclusive
 * (it returns that midnight's bucket too), so rows at or past the end are dropped here.
 * Without fromDate it returns everything since install.
 */
export async function getEnergiesRange(
	env: BlueringEnv,
	gatewayId: number,
	type: SeriesType,
	fromDate?: string,
	toDate?: string,
): Promise<RawEnergy[]> {
	let q = `type=${type}`;
	if (fromDate) q += `&startDate=${encodeURIComponent(bangkokMidnightIso(fromDate))}`;
	if (toDate) q += `&endDate=${encodeURIComponent(bangkokMidnightIso(toDate))}`;
	const rows = await getAllPages<RawEnergy>(env, `/gateways/${gatewayId}/energies?${q}`);
	if (!toDate) return rows;
	const end = Date.parse(bangkokMidnightIso(toDate));
	return rows.filter((r) => Date.parse(r.deviceTime ?? r.date ?? "") < end);
}

export async function getSeries(
	env: BlueringEnv,
	gatewayId: number,
	type: SeriesType,
	date: string,
): Promise<SeriesPoint[]> {
	if (type === "monthly") return toSeries(await getEnergiesRange(env, gatewayId, "monthly"));
	if (type === "minute") return toSeries(await getEnergiesRange(env, gatewayId, "minute", date, nextDay(date)));
	// daily: from that day to today
	return toSeries(await getEnergiesRange(env, gatewayId, "daily", date));
}

function nextDay(date: string): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export interface BlueringSnapshot {
	ts: number;
	plant: PlantInfo;
	/** null before the first bucket of the day has been uploaded (just after midnight) */
	live: LiveReading | null;
	/** seconds since the live bucket started */
	ageSec: number | null;
	tokenExpiresAt: number | null;
	/** true when served from the 60 s KV cache */
	cached: boolean;
}

/** Plant + latest 15-min reading + today's totals, cached 60 s in KV */
export async function getSnapshot(env: BlueringEnv, kv?: KVNamespace, now = Date.now()): Promise<BlueringSnapshot> {
	const hit = await kv?.get<BlueringSnapshot>(SNAPSHOT_KV_KEY, "json");
	if (hit) return { ...hit, cached: true };

	const plant = await getPlant(env, kv);
	const start = encodeURIComponent(bangkokMidnightIso(bangkokToday(now)));
	const rows = await getAllPages<RawPerformanceMinute>(env, `/gateways/${plant.gatewayId}/performances?period=minutes&startDate=${start}`);
	const last = rows.reduce<RawPerformanceMinute | null>((a, b) => (!a || b.date > a.date ? b : a), null);
	const live = last ? toLive(last) : null;

	const snap: BlueringSnapshot = {
		ts: now,
		plant,
		live,
		ageSec: live ? Math.round((now - Date.parse(live.at)) / 1000) : null,
		tokenExpiresAt: tokenExpiry(env.BLUERING_TOKEN ?? ""),
		cached: false,
	};
	await kv?.put(SNAPSHOT_KV_KEY, JSON.stringify(snap), { expirationTtl: SNAPSHOT_TTL_SEC });
	return snap;
}
