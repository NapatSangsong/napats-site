/**
 * Storage for device heartbeats (table device_status, migration 010).
 *
 * THINKPAD_STORE=memory (set only in .dev.vars) swaps in an in-process store
 * so the page/ingest can be exercised under `pnpm dev` without Supabase.
 * Production never sets it.
 */
import { createServiceClient } from "./supabase.server";
import type { DeviceSource, MacPayload, ThinkpadPayload } from "./thinkpad-schema";

export interface NewRow {
	source: DeviceSource;
	reported_at: string | null;
	vpn_up: boolean | null;
	kbs_ok: boolean | null;
	payload: ThinkpadPayload | MacPayload;
}

export interface StoredRow extends NewRow {
	/** server receive time, ms epoch */
	received_at: number;
}

export interface HistoryPoint {
	t: number;
	vpn_up: boolean | null;
	kbs_ok: boolean | null;
}

export interface DeviceStatusStore {
	insert(row: NewRow): Promise<void>;
	latest(source: DeviceSource): Promise<StoredRow | null>;
	/** ascending by time, received_at >= sinceMs */
	history(source: DeviceSource, sinceMs: number): Promise<HistoryPoint[]>;
	purge(beforeMs: number): Promise<void>;
}

export interface StoreEnv {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	THINKPAD_STORE?: string;
}

// ---- in-memory (dev only) ----
const mem: StoredRow[] = [];

export const memoryStore: DeviceStatusStore = {
	async insert(row) {
		mem.push({ ...row, received_at: Date.now() });
	},
	async latest(source) {
		for (let i = mem.length - 1; i >= 0; i--) if (mem[i].source === source) return mem[i];
		return null;
	},
	async history(source, sinceMs) {
		return mem
			.filter((r) => r.source === source && r.received_at >= sinceMs)
			.map((r) => ({ t: r.received_at, vpn_up: r.vpn_up, kbs_ok: r.kbs_ok }));
	},
	async purge(beforeMs) {
		for (let i = mem.length - 1; i >= 0; i--) if (mem[i].received_at < beforeMs) mem.splice(i, 1);
	},
};

// ---- Supabase ----
const PAGE = 1000; // PostgREST max-rows on Supabase

function supabaseStore(env: StoreEnv): DeviceStatusStore {
	const db = createServiceClient(env);
	return {
		async insert(row) {
			const { error } = await db.from("device_status").insert(row);
			if (error) throw new Error(`device_status insert: ${error.message}`);
		},
		async latest(source) {
			const { data, error } = await db
				.from("device_status")
				.select("source,received_at,reported_at,vpn_up,kbs_ok,payload")
				.eq("source", source)
				.order("received_at", { ascending: false })
				.limit(1);
			if (error) throw new Error(`device_status latest: ${error.message}`);
			const r = data?.[0];
			return r ? { ...r, received_at: Date.parse(r.received_at) } : null;
		},
		async history(source, sinceMs) {
			const out: HistoryPoint[] = [];
			for (let from = 0; ; from += PAGE) {
				const { data, error } = await db
					.from("device_status")
					.select("received_at,vpn_up,kbs_ok")
					.eq("source", source)
					.gte("received_at", new Date(sinceMs).toISOString())
					.order("received_at", { ascending: true })
					.range(from, from + PAGE - 1);
				if (error) throw new Error(`device_status history: ${error.message}`);
				for (const r of data ?? []) out.push({ t: Date.parse(r.received_at), vpn_up: r.vpn_up, kbs_ok: r.kbs_ok });
				if (!data || data.length < PAGE) break;
			}
			return out;
		},
		async purge(beforeMs) {
			const { error } = await db.from("device_status").delete().lt("received_at", new Date(beforeMs).toISOString());
			if (error) throw new Error(`device_status purge: ${error.message}`);
		},
	};
}

export function getStore(env: StoreEnv): DeviceStatusStore {
	return env.THINKPAD_STORE === "memory" ? memoryStore : supabaseStore(env);
}
