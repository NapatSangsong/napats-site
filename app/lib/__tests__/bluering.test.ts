/**
 * BlueRing client: pure mapping helpers plus the HTTP/paging layer against a stubbed
 * fetch. The fixture rows are trimmed copies of real responses (2026-11-12) with
 * serial numbers replaced.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	BLUERING_BASE,
	BlueringAuthError,
	bangkokMidnightIso,
	bangkokToday,
	blueringGet,
	getAllPages,
	getSnapshot,
	type RawPerformanceMinute,
	type RawPlant,
	toLive,
	toPlantInfo,
	toSeries,
	tokenExpiry,
} from "../bluering.server";

function jwt(payload: object): string {
	const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
	return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

const PLANT: RawPlant = {
	id: 198,
	name: "Home",
	type: "home",
	status: "normal",
	eaType: "mea",
	meterType: "tou",
	meterReadingDate: 2,
	grid: { purchasePrice: 6.31, purchaseOffPeakPrice: 2.93, salePrice: 2.2 },
	gatewayId: 835,
	gateway: {
		id: 835,
		serialNumber: "SN-GATEWAY",
		dailySolar: 3.13,
		dailyGrid: 7.27,
		dailyConsumption: 10.4,
		inverters: [
			{ id: 517, model: "MI-1000-2M0", serialNumber: "SN-1", pvCount: 2 },
			{ id: 518, model: "MI-1000-2M0", serialNumber: "SN-2", pvCount: 2 },
		],
	},
};

const PERF: RawPerformanceMinute = {
	date: "2026-11-12T04:45:00.000Z",
	pvActivePower: 1.28,
	pvReactivePower: 0,
	gridActivePower: 0.03,
	gridVoltage: 232.1,
	gridCurrent: 1.4,
	dailyEnergyGeneration: 3.61,
	dailyEnergySold: 0,
	dailyEnergyPurchased: 7.28,
};

describe("dates", () => {
	it("sends a Bangkok day as its midnight in UTC", () => {
		expect(bangkokMidnightIso("2026-11-12")).toBe("2026-11-11T17:00:00.000Z");
	});
	it("uses the Bangkok calendar day, not UTC", () => {
		// 2026-11-11 18:30 UTC is already 01:30 on the 12th in Bangkok
		expect(bangkokToday(Date.parse("2026-11-11T18:30:00Z"))).toBe("2026-11-12");
	});
});

describe("tokenExpiry", () => {
	it("reads exp from a JWT and is null otherwise", () => {
		expect(tokenExpiry(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
		expect(tokenExpiry("opaque")).toBeNull();
	});
});

describe("mapping", () => {
	it("toPlantInfo keeps tariff + inverter models and drops serial numbers", () => {
		const info = toPlantInfo(PLANT);
		expect(info).toMatchObject({
			plantId: 198,
			gatewayId: 835,
			meterType: "tou",
			tariff: { peakThbPerKwh: 6.31, offPeakThbPerKwh: 2.93, saleThbPerKwh: 2.2 },
		});
		expect(info.inverters).toEqual([
			{ model: "MI-1000-2M0", pvCount: 2 },
			{ model: "MI-1000-2M0", pvCount: 2 },
		]);
		expect(JSON.stringify(info)).not.toContain("SN-");
	});

	it("toLive converts kW to W and derives home load and self-powered share", () => {
		const live = toLive(PERF);
		expect(live).toMatchObject({ solarW: 1280, gridW: 30, homeW: 1310, gridVoltageV: 232.1 });
		// matches the daily energies row for the same day: consumption 10.89
		expect(live.today).toEqual({
			solarKwh: 3.61,
			gridPurchasedKwh: 7.28,
			gridSoldKwh: 0,
			consumptionKwh: 10.89,
			selfPoweredPct: 33,
		});
	});

	it("toLive never reports negative home load while exporting", () => {
		expect(toLive({ ...PERF, pvActivePower: 2, gridActivePower: -2.5 }).homeW).toBe(0);
	});

	it("toSeries uses deviceTime or date, sorts, and keeps grid only for minute rows", () => {
		const s = toSeries([
			{ solar: 1.981, grid: 2.39, gridPurchased: 7.02, gridSold: 0, consumption: 4.37, deviceTime: "2026-11-12T03:15:00.000Z" },
			{ solar: 0, grid: 0.46, gridPurchased: 0.29, gridSold: 0, consumption: 0.46, deviceTime: "2026-11-11T17:00:00.000Z" },
		]);
		expect(s.map((p) => p.t)).toEqual(["2026-11-11T17:00:00.000Z", "2026-11-12T03:15:00.000Z"]);
		expect(s[1]).toMatchObject({ solar: 1.98, grid: 2.39 });
		const daily = toSeries([{ solar: 3.61, gridPurchased: 7.28, gridSold: 0, consumption: 10.89, date: "2026-11-11T17:00:00.000Z" }]);
		expect(daily[0]).not.toHaveProperty("grid");
	});
});

describe("HTTP", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("fails fast without a token or with an expired JWT", async () => {
		const f = vi.fn();
		vi.stubGlobal("fetch", f);
		await expect(blueringGet({}, "/users/me")).rejects.toBeInstanceOf(BlueringAuthError);
		await expect(blueringGet({ BLUERING_TOKEN: jwt({ exp: 1 }) }, "/users/me")).rejects.toBeInstanceOf(BlueringAuthError);
		expect(f).not.toHaveBeenCalled();
	});

	it("sends the bearer token and maps 401 to BlueringAuthError", async () => {
		const f = vi.fn().mockResolvedValue(new Response('{"message":"Unauthorized: Missing token"}', { status: 401 }));
		vi.stubGlobal("fetch", f);
		await expect(blueringGet({ BLUERING_TOKEN: "t" }, "/users/me")).rejects.toBeInstanceOf(BlueringAuthError);
		expect(f.mock.calls[0][0]).toBe(`${BLUERING_BASE}/users/me`);
		expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer t");
	});

	it("getAllPages follows offset until a short page", async () => {
		const full = Array.from({ length: 200 }, (_, i) => i);
		const f = vi
			.fn()
			.mockResolvedValueOnce(Response.json(full))
			.mockResolvedValueOnce(Response.json([200, 201]));
		vi.stubGlobal("fetch", f);
		const rows = await getAllPages<number>({ BLUERING_TOKEN: "t" }, "/gateways/835/energies?type=minute");
		expect(rows).toHaveLength(202);
		expect(f.mock.calls[0][0]).toContain("type=minute&limit=200&offset=0");
		expect(f.mock.calls[1][0]).toContain("offset=200");
	});

	it("getSnapshot discovers the plant, takes the newest bucket, and caches both", async () => {
		const store = new Map<string, string>();
		const kv = {
			get: async (k: string, type?: string) => {
				const v = store.get(k);
				return v === undefined ? null : type === "json" ? JSON.parse(v) : v;
			},
			put: async (k: string, v: string) => void store.set(k, v),
		} as unknown as KVNamespace;
		const older = { ...PERF, date: "2026-11-12T04:30:00.000Z", pvActivePower: 0.5 };
		const f = vi.fn(async (url: string) => {
			if (url.endsWith("/users/me")) return Response.json({ id: 225 });
			if (url.endsWith("/users/225/plants")) return Response.json([PLANT]);
			if (url.includes("/gateways/835/performances?period=minutes&startDate=2026-11-11T17%3A00%3A00.000Z")) {
				return Response.json([PERF, older]);
			}
			return new Response("{}", { status: 404 });
		});
		vi.stubGlobal("fetch", f);

		const now = Date.parse("2026-11-12T04:52:00Z");
		const snap = await getSnapshot({ BLUERING_TOKEN: "t" }, kv, now);
		expect(snap.live?.solarW).toBe(1280);
		expect(snap.ageSec).toBe(420);
		expect(snap.plant.gatewayId).toBe(835);
		expect(snap.cached).toBe(false);

		const again = await getSnapshot({ BLUERING_TOKEN: "t" }, kv, now);
		expect(again.cached).toBe(true);
		expect(f).toHaveBeenCalledTimes(3);
	});
});
