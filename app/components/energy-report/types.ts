/**
 * Wire types for /energy/report — shared by the loader, the /api/energy/report
 * route, and the client components. Keep isomorphic (no server imports).
 */
import type { BillingCycle, CycleOutlook } from "~/lib/energy-calc";

/** One energy_daily row as the report consumes it (kWh, calibrated) */
export interface ReportDailyRow {
	day: number; // BKK dayNum
	date: string; // date_bkk "YYYY-MM-DD"
	totalKwh: number;
	onKwh: number;
	offKwh: number;
	/** distinct hours with data — <23 = partial day */
	hours: number;
	baseload: number | null;
}

/** Hourly kWh for one day of the selected cycle (drill-down) */
export interface ReportHourlyDay {
	day: number;
	/** 24 buckets, BKK hours */
	kwh: number[];
}

export interface ReportPayload {
	ok: true;
	cycle: BillingCycle;
	/** ALL history — powers the month switcher and cycle compare */
	daily: ReportDailyRow[];
	/** selected cycle only */
	hourly: ReportHourlyDay[];
	/** end-of-cycle projection for the selected cycle */
	outlook: CycleOutlook;
	fetchedAt: number;
}

/** Loader fallback — data source unreachable; page renders a retry card */
export interface ReportUnavailable {
	ok: false;
	error: string;
	fetchedAt: number;
}

export type ReportResult = ReportPayload | ReportUnavailable;
