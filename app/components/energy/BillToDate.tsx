import type { Analysis, Finance } from "~/lib/energy-calc";
import { ENERGY_CONST as C, FLAT_TIERS, flatEnergyBaht, dayNum, weekdayOf } from "~/lib/energy-calc";
import { f0, f1, money } from "~/lib/energy-format";
import type { LiveData } from "./types";

const DAY_MS = 86400_000;
/** YYYY-MM (BKK) for a dayNum — same convention as the rollup's date_bkk. */
const ymOf = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 7);

/**
 * Accrued bill for the current billing cycle (calendar month so far), from the
 * actual calibrated usage. Two tariffs side by side:
 *   - Flat: MEA Type 1.1.2 tiered ladder on the month's accumulated units + Ft + VAT + service
 *   - TOU:  on/off-peak split × TOU rates + service
 */
export function BillToDate({ a, f, live }: { a: Analysis; f: Finance; live: LiveData | null }) {
	const curYM = ymOf(dayNum(a.t1));
	let kwh = 0;
	let on = 0;
	let off = 0;
	let days = 0;
	for (const [d, v] of a.daily) {
		if (ymOf(d) !== curYM) continue;
		kwh += v;
		on += a.dailyOn.get(d) ?? 0;
		off += a.dailyOff.get(d) ?? 0;
		days += 1;
	}

	const flat = flatEnergyBaht(kwh) + C.FLAT_FIXED; // tiered energy + Ft + VAT + service
	const tou = on * C.TOU_ON + off * C.TOU_OFF + C.TOU_FIXED;
	const cheaper = tou <= flat ? "TOU" : "Flat";
	const gap = Math.abs(flat - tou);
	const tierStr = FLAT_TIERS.map(([, r]) => r).join("/");

	// Today (latest BKK day) — energy charge only (the monthly service fee isn't
	// attributable to a single day). Flat is the marginal cost of today's units
	// given where the cycle sits on the tier ladder.
	const today = dayNum(a.t1);
	const todayKwh = a.daily.get(today) ?? 0;
	const todayOn = a.dailyOn.get(today) ?? 0;
	const todayOff = a.dailyOff.get(today) ?? 0;
	const flatToday = flatEnergyBaht(kwh) - flatEnergyBaht(Math.max(0, kwh - todayKwh));
	const touToday = todayOn * C.TOU_ON + todayOff * C.TOU_OFF;

	// TOU + solar estimate for today. Solar offsets the daytime bucket — on-peak on
	// weekdays, off-peak on weekends (same rule as finance()). Adds the monthly
	// solar subscription prorated to one day. 4kW ≈ 2× the 2kW system.
	const SOLAR_4K_KWH_D = 4 * C.SOLAR_PSH * C.SOLAR_PR; // 4kWp × PSH × PR (same model as 2kW)
	const SOLAR_4K_SUB = 1399;
	const weekendToday = weekdayOf(today) >= 5;
	const touSolarToday = (prodKwh: number, subMonthly: number) => {
		const usable = Math.min(prodKwh, weekendToday ? todayOff : todayOn);
		const energy = weekendToday
			? todayOn * C.TOU_ON + (todayOff - usable) * C.TOU_OFF
			: (todayOn - usable) * C.TOU_ON + todayOff * C.TOU_OFF;
		return energy + subMonthly / 30;
	};
	const tou2kToday = touSolarToday(C.SOLAR_KWH_D, C.BLUERING);
	const tou4kToday = touSolarToday(SOLAR_4K_KWH_D, SOLAR_4K_SUB);

	const todayOpts = [
		{ k: "Flat", v: flatToday },
		{ k: "TOU", v: touToday },
		{ k: "TOU+2k", v: tou2kToday },
		{ k: "TOU+4k", v: tou4kToday },
	];
	const cheapestToday = todayOpts.reduce((best, o) => (o.v < best.v ? o : best)).k;

	// Full-month projection — reuses finance()'s monthly costs (respects the
	// MEA/measured basis toggle). cost1/2/3 are flat / TOU / TOU+2k-solar; the 4k
	// variant mirrors finance()'s solar offset with the larger array + its sub.
	const usableD4k = Math.min(SOLAR_4K_KWH_D, f.daytimeLoadD);
	const offOn4k = Math.min(usableD4k * C.WEEKDAYS_MO, f.onKwh);
	const offOff4k = Math.min(usableD4k * C.WEEKENDS_MO, f.offKwh);
	const month4k =
		(f.onKwh - offOn4k) * C.TOU_ON + (f.offKwh - offOff4k) * C.TOU_OFF + C.TOU_FIXED + SOLAR_4K_SUB;
	const monthOpts = [
		{ k: "Flat", v: f.cost1 },
		{ k: "TOU", v: f.cost2 },
		{ k: "TOU+2k", v: f.cost3 },
		{ k: "TOU+4k", v: month4k },
	];
	const cheapestMonth = monthOpts.reduce((best, o) => (o.v < best.v ? o : best)).k;

	return (
		<section>
			<div className="sec-head">
				<span className="mono">฿</span>
				<h2>ค่าไฟสะสมรอบบิลนี้ (ถึงตอนนี้)</h2>
			</div>
			{live && (
				<div className="bar-label">
					<b>เลขมิเตอร์ล่าสุด {f1(live.meter_kwh)} หน่วย</b>
					<span className="mono">จากมิเตอร์โดยตรง · เทียบหน้าปัดได้</span>
				</div>
			)}
			<div className="bar-label">
				<b>
					ใช้ไปแล้ว {f0(kwh)} หน่วย · {days} วัน (เดือนนี้)
				</b>
				<span className="mono">
					{cheaper} ถูกกว่า · ต่างกัน {money(gap)} ฿
				</span>
			</div>
			<div className="vstats" style={{ marginTop: 16 }}>
				<div className="vstat">
					<span className="mono" style={{ fontSize: "1.6rem" }}>{money(flat)} ฿</span>
					<span>
						Flat — ขั้นบันได กฟน. ({tierStr} ฿) + Ft {C.FT_RATE} + VAT 7% + ค่าบริการ
					</span>
				</div>
				<div className="vstat">
					<span className="mono" style={{ fontSize: "1.6rem" }}>{money(tou)} ฿</span>
					<span>
						TOU — On {f1(on)}×{C.TOU_ON} + Off {f1(off)}×{C.TOU_OFF} + ค่าบริการ
					</span>
				</div>
			</div>
			<div className="bar-label" style={{ marginTop: 22 }}>
				<b>
					วันนี้ — ใช้ {f1(todayKwh)} หน่วย (On {f1(todayOn)} / Off {f1(todayOff)})
				</b>
				<span className="mono">{cheapestToday} ถูกสุด</span>
			</div>
			<div className="vstats">
				<div className="vstat">
					<span className="mono" style={{ fontSize: "1.2rem" }}>{money(flatToday)} ฿</span>
					<span>Flat วันนี้ (เฉพาะค่าพลังงาน + Ft + VAT)</span>
				</div>
				<div className="vstat">
					<span className="mono" style={{ fontSize: "1.2rem" }}>{money(touToday)} ฿</span>
					<span>TOU วันนี้ (เฉพาะค่าพลังงาน)</span>
				</div>
				<div className="vstat">
					<span className="mono" style={{ fontSize: "1.2rem" }}>{money(tou2kToday)} ฿</span>
					<span>TOU + Solar 2kW (ประมาณการ · รวม sub {f0(C.BLUERING)}/ด เฉลี่ย/วัน)</span>
				</div>
				<div className="vstat">
					<span className="mono" style={{ fontSize: "1.2rem" }}>{money(tou4kToday)} ฿</span>
					<span>TOU + Solar 4kW (ประมาณการ · รวม sub {f0(SOLAR_4K_SUB)}/ด เฉลี่ย/วัน)</span>
				</div>
			</div>
			{/* ===== full-month projection — visually separated block ===== */}
			<div
				style={{
					marginTop: 28,
					borderTop: "2px solid var(--line)",
					paddingTop: 20,
				}}
			>
				<div className="sec-head" style={{ marginBottom: 4 }}>
					<span className="mono">📅</span>
					<h2 style={{ fontSize: "1.05rem" }}>ประมาณการทั้งเดือน</h2>
				</div>
				<div className="bar-label">
					<b>เต็มเดือน ~{f0(f.monthlyKwh)} หน่วย</b>
					<span className="mono">{cheapestMonth} ถูกสุด · รวมค่าบริการ/sub เต็มเดือน</span>
				</div>
				<div className="vstats">
					<div className="vstat">
						<span className="mono" style={{ fontSize: "1.4rem" }}>{money(f.cost1)} ฿</span>
						<span>Flat ทั้งเดือน (ขั้นบันได + Ft + VAT + ค่าบริการ)</span>
					</div>
					<div className="vstat">
						<span className="mono" style={{ fontSize: "1.4rem" }}>{money(f.cost2)} ฿</span>
						<span>TOU ทั้งเดือน (+ ค่าบริการ)</span>
					</div>
					<div className="vstat">
						<span className="mono" style={{ fontSize: "1.4rem" }}>{money(f.cost3)} ฿</span>
						<span>TOU + Solar 2kW (+ sub {f0(C.BLUERING)}/ด เต็มเดือน)</span>
					</div>
					<div className="vstat">
						<span className="mono" style={{ fontSize: "1.4rem" }}>{money(month4k)} ฿</span>
						<span>TOU + Solar 4kW (+ sub {f0(SOLAR_4K_SUB)}/ด เต็มเดือน)</span>
					</div>
				</div>
			</div>

			<p className="pt-note">
				* รอบบิล: นับตามเดือนปฏิทิน เป็นยอดสะสมถึงตอนนี้ (รวมค่าบริการ) · วันนี้: เฉพาะค่าพลังงาน
				ไม่รวมค่าบริการรายเดือน · Solar = ประมาณการที่ PSH {C.SOLAR_PSH} × PR {Math.round(C.SOLAR_PR * 100)}% (ไม่โลกสวย):
				2kW ≈ {f1(C.SOLAR_KWH_D)} / 4kW ≈ {f1(SOLAR_4K_KWH_D)} หน่วย/วัน, offset{" "}
				{weekendToday ? "off-peak (วันหยุด)" : "on-peak (วันธรรมดา)"} รวมค่า sub รายเดือนเฉลี่ยต่อวัน ·
				ทุกค่าคิดจากหน่วยที่ใช้จริง (ผ่าน calibration แล้ว) · ประมาณการทั้งเดือน: อิงฐาน{" "}
				{f0(f.monthlyKwh)} หน่วย/เดือน (สลับ บิล MEA / วัดจริง ที่ปุ่มด้านบน) รวมค่าบริการ + sub เต็มเดือน
			</p>
		</section>
	);
}
