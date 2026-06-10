/** Shape returned by /api/energy/live (scaled values, no secrets) */
export interface LiveData {
	ts: number;
	power_w: number;
	voltage_v: number;
	current_a: number;
	power_factor: number;
	freq_hz: number;
	meter_kwh: number;
	raw: Array<{ code: string; value: unknown }>;
}

/** Client-side fetch bookkeeping for the Technical Inspector */
export interface ApiStats {
	liveEndpoint: string;
	historyEndpoint: string;
	liveLatencyMs: number | null;
	historyLatencyMs: number | null;
	liveFetches: number;
	historyFetches: number;
	historyRows: number;
	historyFetchedAt: number | null;
	liveOffline: boolean;
}
