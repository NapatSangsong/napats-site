/**
 * Formatting helpers matching the Python f-string specs used by dashboard.py
 * v10, so rendered numbers/dates are character-identical to the reference
 * HTML. Fixed English month names — no Intl locale drift.
 */

const BKK_MS = 7 * 3600 * 1000;
const DAY_MS = 86400 * 1000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Python {:,.2f} */
export const money = (x: number): string =>
	x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Python f"{x*100:.1f}" */
export const pc = (x: number): string => (x * 100).toFixed(1);

export const f0 = (x: number): string => Math.round(x).toLocaleString("en-US");
export const f1 = (x: number): string => x.toFixed(1);
export const f2 = (x: number): string => x.toFixed(2);

function partsOfDay(day: number): { y: number; m: number; d: number } {
	const dt = new Date(day * DAY_MS);
	return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

/** Python {date:%d %b} → "07 Jun" */
export function dayMonth(day: number): string {
	const { m, d } = partsOfDay(day);
	return `${String(d).padStart(2, "0")} ${MONTHS[m]}`;
}

/** Python {date:%d %b %Y} → "11 Oct 2026" */
export function dayMonthYear(day: number): string {
	const { y, m, d } = partsOfDay(day);
	return `${String(d).padStart(2, "0")} ${MONTHS[m]} ${y}`;
}

/** Python date.day (no leading zero) */
export function dayOnly(day: number): number {
	return partsOfDay(day).d;
}

/** Python {dt:%d %b %H:%M} in Asia/Bangkok */
export function timeLabel(ms: number): string {
	const dt = new Date(ms + BKK_MS);
	const d = String(dt.getUTCDate()).padStart(2, "0");
	const h = String(dt.getUTCHours()).padStart(2, "0");
	const min = String(dt.getUTCMinutes()).padStart(2, "0");
	return `${d} ${MONTHS[dt.getUTCMonth()]} ${h}:${min}`;
}

/** "HH:MM:SS" in Asia/Bangkok (Live Now timestamp) */
export function clockLabel(ms: number): string {
	const dt = new Date(ms + BKK_MS);
	const h = String(dt.getUTCHours()).padStart(2, "0");
	const m = String(dt.getUTCMinutes()).padStart(2, "0");
	const s = String(dt.getUTCSeconds()).padStart(2, "0");
	return `${h}:${m}:${s}`;
}
