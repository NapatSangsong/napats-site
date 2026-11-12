/** Formatting for the /energy page. Bangkok is fixed UTC+7, so offset arithmetic is exact. */
const BKK = 7 * 3600_000;

const nf0 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const n0 = (v: number) => nf0.format(v);
export const n1 = (v: number) => nf1.format(v);
export const n2 = (v: number) => nf2.format(v);
export const baht = (v: number) => `${nf0.format(Math.round(v))} ฿`;
export const kwh = (v: number) => `${v >= 100 ? nf0.format(v) : nf1.format(v)} kWh`;

/** Watts, switching to kW from 1,000 W */
export function watts(w: number): { value: string; unit: string } {
	const a = Math.abs(w);
	return a >= 1000 ? { value: nf2.format(w / 1000), unit: "kW" } : { value: nf0.format(w), unit: "W" };
}

export function hhmm(ms: number): string {
	return new Date(ms + BKK).toISOString().slice(11, 16);
}

export function hourLabel(ms: number): string {
	const h = new Date(ms + BKK).getUTCHours();
	return `${String(h).padStart(2, "0")}:00`;
}

const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-11-13" → { dow: "ศ.", day: 13, mon: "พ.ย." } */
export function thDate(date: string) {
	const d = new Date(`${date}T00:00:00Z`);
	return { dow: TH_DOW[d.getUTCDay()], day: d.getUTCDate(), mon: TH_MON[d.getUTCMonth()] };
}

export const thShort = (date: string) => {
	const t = thDate(date);
	return `${t.day} ${t.mon}`;
};

/** "2026-10" → "ต.ค. 69" (Buddhist year, 2 digits) */
export function thMonth(month: string): string {
	const [y, m] = month.split("-").map(Number);
	return `${TH_MON[m - 1]} ${String(y + 543).slice(2)}`;
}

export function ago(sec: number): string {
	if (sec < 90) return "เมื่อสักครู่";
	const m = Math.round(sec / 60);
	if (m < 60) return `${m} นาทีที่แล้ว`;
	const h = Math.floor(m / 60);
	return `${h} ชม. ${m % 60} นาทีที่แล้ว`;
}
