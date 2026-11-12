/**
 * getView's cache contract: fresh views are served as-is, old ones rebuilt, and a failed
 * rebuild falls back to the last good view (marked stale) instead of an error page.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { type EnergyView, getView } from "../energy-model.server";

function memKv(seed: Record<string, unknown> = {}) {
	const store = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
	return {
		store,
		kv: {
			get: async (k: string, type?: string) => {
				const v = store.get(k);
				return v === undefined ? null : type === "json" ? JSON.parse(v) : v;
			},
			put: async (k: string, v: string) => void store.set(k, v),
		} as unknown as KVNamespace,
	};
}

const NOW = Date.parse("2026-11-12T05:00:00Z");
const cached = { generatedAt: NOW - 20 * 60_000, cycles: [] } as unknown as EnergyView;
const VIEW_KEY = "energy:v2:view:4";

describe("getView", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("serves a view younger than 5 min without touching BlueRing", async () => {
		const f = vi.fn();
		vi.stubGlobal("fetch", f);
		const fresh = { ...cached, generatedAt: NOW - 60_000 };
		const { kv } = memKv({ [VIEW_KEY]: fresh });
		const v = await getView({ BLUERING_TOKEN: "t" }, kv, false, NOW);
		expect(v.generatedAt).toBe(fresh.generatedAt);
		expect(f).not.toHaveBeenCalled();
	});

	it("falls back to the last good view, marked stale, when the token is gone", async () => {
		vi.stubGlobal("fetch", vi.fn());
		const { kv } = memKv({ [VIEW_KEY]: cached });
		const v = await getView({}, kv, false, NOW);
		expect(v.stale).toEqual({ reason: "token_expired", at: NOW });
		expect(v.generatedAt).toBe(cached.generatedAt);
	});

	it("falls back with reason 'error' when BlueRing is down", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
		const { kv } = memKv({ [VIEW_KEY]: cached });
		const v = await getView({ BLUERING_TOKEN: "t" }, kv, false, NOW);
		expect(v.stale?.reason).toBe("error");
	});

	it("throws when there is nothing cached to fall back to", async () => {
		vi.stubGlobal("fetch", vi.fn());
		const { kv } = memKv();
		await expect(getView({}, kv, false, NOW)).rejects.toThrow(/token/i);
	});
});
