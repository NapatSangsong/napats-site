import type { Analysis, Finance } from "~/lib/energy-calc";
import { ENERGY_CONST as C, FLAT_TIERS, flatEnergyBaht, dayNum, weekdayOf, touSolarScenario, billingCycleOf } from "~/lib/energy-calc";
import { dayMonth, f0, f1, money } from "~/lib/energy-format";
import type { LiveData } from "./types";

/**
 * Bill for the current billing cycle (cuts on the 2nd, BKK), four tariffs side by side.
 * Each row shows BOTH the accrued-so-far (actual calibrated usage to date) and
 * the full-month projection (finance(), respects the MEA/measured toggle), plus
 * a today-only block. Solar uses the explicit PSH × PR model from energy-calc.
 */
export function BillToDate({
	a,
	f,
	live,
	solarPr,
}: { a: Analysis; f: Finance; live: LiveData | null; solarPr: number }) {
	const solar2k = C.SOLAR_KWP * C.SOLAR_PSH * solarPr; // 2kWp × PSH × PR(case)
	const solar4k = C.SOLAR_4K_KWP * C.SOLAR_PSH * solarPr; // 4kWp × PSH × PR(case)

	// ── accumulate the current billing cycle [2nd … 1st] (actual, calibrated) ──
	const cyc = billingCycleOf(a.t1);
	let kwh = 0;
	let on = 0;
	let off = 0;
	let days = 0;
	// solar offset accrued over elapsed days (weekday → on-peak, weekend → off-peak)
	let offOn2k = 0;
	let offOff2k = 0;
	let offOn4k = 0;
	let offOff4k = 0;
	for (const [d, v] of a.daily) {
		if (d < cyc.startDay || d > cyc.endDay) continue;
		const dOn = a.dailyOn.get(d) ?? 0;
		const dOff = a.dailyOff.get(d) ?? 0;
		kwh += v;
		on += dOn;
		off += dOff;
		days += 1;
		if (weekdayOf(d) >= 5) {
			offOff2k += Math.min(solar2k, dOff);
			offOff4k += Math.min(solar4k, dOff);
		} else {
			offOn2k += Math.min(solar2k, dOn);
			offOn4k += Math.min(solar4k, dOn);
		}
	}

	// ── accrued so far (actual), all four tariffs ──
	// Fixed charges + solar subscription are monthly, so prorate them by elapsed
	// days — otherwise a full month's sub (699/1399) on a few days of energy makes
	// solar look absurdly expensive mid-cycle. Energy is the real accrued usage.
	const cycleLen = cyc.endDay - cyc.startDay + 1;
	const fixedF = cycleLen > 0 ? days / cycleLen : 0; // share of the cycle elapsed
	const flat = flatEnergyBaht(kwh) + C.FLAT_FIXED * fixedF;
	const tou = on * C.TOU_ON + off * C.TOU_OFF + C.TOU_FIXED * fixedF;
	const touSolar2k =
		(on - offOn2k) * C.TOU_ON + (off - offOff2k) * C.TOU_OFF + (C.TOU_FIXED + C.BLUERING) * fixedF;
	const touSolar4k =
		(on - offOn4k) * C.TOU_ON + (off - offOff4k) * C.TOU_OFF + (C.TOU_FIXED + C.SOLAR_4K_SUB) * fixedF;

	// ── full-month projection (mirrors finance(); 4k uses the same solar model) ──
	const month4k = touSolarScenario(f, solar4k, C.SOLAR_4K_SUB).cost;

	const rows = [
		{ k: "Flat", soFar: flat, month: f.cost1, desc: `ขั้นบันได (${FLAT_TIERS.map(([, r]) => r).join("/")}) + Ft + VAT + ค่าบริการ` },
		{ k: "TOU", soFar: tou, month: f.cost2, desc: `On ${f1(on)}×${C.TOU_ON} + Off ${f1(off)}×${C.TOU_OFF} + ค่าบริการ` },
		{ k: "TOU + Solar 2kW", soFar: touSolar2k, month: f.cost3, desc: `solar ${f1(solar2k)} หน่วย/วัน + sub ${f0(C.BLUERING)}/ด` },
		{ k: "TOU + Solar 4kW", soFar: touSolar4k, month: month4k, desc: `solar ${f1(solar4k)} หน่วย/วัน + sub ${f0(C.SOLAR_4K_SUB)}/ด` },
	];
	const cheapestSoFar = rows.reduce((b, o) => (o.soFar < b.soFar ? o : b)).k;

	// ── today (energy only; solar prorates the monthly sub to one day) ──
	const today = dayNum(a.t1);
	const todayKwh = a.daily.get(today) ?? 0;
	const todayOn = a.dailyOn.get(today) ?? 0;
	const todayOff = a.dailyOff.get(today) ?? 0;
	const weekendToday = weekdayOf(today) >= 5;
	const flatToday = flatEnergyBaht(kwh) - flatEnergyBaht(Math.max(0, kwh - todayKwh));
	const touToday = todayOn * C.TOU_ON + todayOff * C.TOU_OFF;
	const touSolarToday = (prodKwh: number, subMonthly: number) => {
		const usable = Math.min(prodKwh, weekendToday ? todayOff : todayOn);
		const energy = weekendToday
			? todayOn * C.TOU_ON + (todayOff - usable) * C.TOU_OFF
			: (todayOn - usable) * C.TOU_ON + todayOff * C.TOU_OFF;
		return energy + subMonthly / 30;
	};
	const todayRows = [
		{ k: "Flat", v: flatToday },
		{ k: "TOU", v: touToday },
		{ k: "TOU + Solar 2kW", v: touSolarToday(solar2k, C.BLUERING) },
		{ k: "TOU + Solar 4kW", v: touSolarToday(solar4k, C.SOLAR_4K_SUB) },
	];
	const cheapestToday = todayRows.reduce((b, o) => (o.v < b.v ? o : b)).k;

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
					ใช้ไปแล้ว {f0(kwh)} หน่วย · {days} วัน (รอบบิล {dayMonth(cyc.startDay)} – {dayMonth(cyc.endDay)})
				</b>
				<span className="mono">{cheapestSoFar} ถูกสุดตอนนี้</span>
			</div>
			{/* each box: accrued-so-far (big) + full-month projection (small) */}
			<div className="vstats" style={{ marginTop: 16 }}>
				{rows.map((o) => (
					<div className="vstat" key={o.k}>
						<span className="mono" style={{ fontSize: "1.5rem" }}>{money(o.soFar)} ฿</span>
						<span>
							<b style={{ color: "var(--ink)" }}>{o.k}</b> · สะสมแล้ว — {o.desc}
						</span>
						<span className="mono" style={{ fontSize: "0.82rem", opacity: 0.7 }}>
							ทั้งเดือน (ประมาณ) ~{money(o.month)} ฿
						</span>
					</div>
				))}
			</div>

			{/* today — energy only */}
			<div
				className="bar-label"
				style={{ marginTop: 26, borderTop: "2px solid var(--line)", paddingTop: 18 }}
			>
				<b>
					วันนี้ — ใช้ {f1(todayKwh)} หน่วย (On {f1(todayOn)} / Off {f1(todayOff)})
				</b>
				<span className="mono">{cheapestToday} ถูกสุด</span>
			</div>
			<div className="vstats">
				{todayRows.map((o) => (
					<div className="vstat" key={o.k}>
						<span className="mono" style={{ fontSize: "1.2rem" }}>{money(o.v)} ฿</span>
						<span>
							{o.k} วันนี้
							{o.k.includes("Solar") ? " (ประมาณการ · รวม sub เฉลี่ย/วัน)" : " (เฉพาะค่าพลังงาน)"}
						</span>
					</div>
				))}
			</div>

			<p className="pt-note">
				* “สะสมแล้ว” = ยอดจริงถึงตอนนี้ (ค่าบริการ/sub เฉลี่ยตามวันที่ผ่าน {days}/{cycleLen} วัน · รอบบิลตัดวันที่ 2) · “ทั้งเดือน” = ประมาณการอิงฐาน{" "}
				{f0(f.monthlyKwh)} หน่วย/เดือน (สลับ บิล MEA / วัดจริง ที่ปุ่มด้านบน) · วันนี้ = เฉพาะค่าพลังงาน ·
				Solar คิดที่ PSH {C.SOLAR_PSH} × PR {Math.round(solarPr * 100)}%: 2kW {f1(solar2k)} / 4kW{" "}
				{f1(solar4k)} หน่วย/วัน, offset {weekendToday ? "off-peak (วันหยุด)" : "on-peak (วันธรรมดา)"} · ทุกค่าผ่าน calibration แล้ว
			</p>
		</section>
	);
}
