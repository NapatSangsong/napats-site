import type { Analysis, Finance, Forecast } from "~/lib/energy-calc";
import { ENERGY_CONST as C } from "~/lib/energy-calc";
import { dayMonth, f0, f2, money, timeLabel } from "~/lib/energy-format";

/** Section 08 — verdict: which of the three tariffs is cheapest THIS month, all
 *  data-driven (recomputes with the basis toggle), consistent with the scenario
 *  cards. Solar = the 4kW system installed 21 ก.ค. (cost3). No fixed numbers. */
export function Verdict({
	a,
	f,
	fc,
	solarPr,
}: { a: Analysis; f: Finance; fc: Forecast; solarPr: number }) {
	const opts = [
		{ k: "Flat (มิเตอร์ปกติ)", cost: f.cost1, solar: false },
		{ k: "TOU เดี่ยว", cost: f.cost2, solar: false },
		{ k: "TOU + Solar 4kW", cost: f.cost3, solar: true },
	];
	const sorted = [...opts].sort((x, y) => x.cost - y.cost);
	const best = sorted[0];
	const runnerUp = sorted[1];
	const vsFlat = f.cost1 - best.cost; // ฿/mo saved vs the default flat meter
	const solar4kKwhD = C.SOLAR_4K_KWP * C.SOLAR_PSH * solarPr;

	return (
		<>
			<section>
				<div className="sec-head">
					<span className="mono">08</span>
					<h2>คำตัดสิน — ตัวเลือกที่ถูกสุดเดือนนี้</h2>
				</div>
				<div className={`verdict ${best.solar ? "viable" : "not-viable"}`}>
					<div className="big">
						<span className="pill">ถูกสุด</span>
						<h2>
							{best.k} — {money(best.cost)} ฿/เดือน
						</h2>
					</div>
					<p>
						ประหยัด {money(vsFlat)} ฿/เดือน เทียบมิเตอร์ปกติ (Flat) · อันดับสอง {runnerUp.k} ห่าง{" "}
						{money(runnerUp.cost - best.cost)} ฿
						{best.solar ? "" : " — โซลาร์ที่ช่วยได้ยังไม่ชนะตัวเลือกนี้ (ต้องใช้ไฟกลางวันมากกว่านี้)"}
					</p>
					<div className="vstats">
						<div className="vstat">
							<span className="mono">{money(vsFlat)} ฿/ด.</span>
							<span>ประหยัดจาก Flat เมื่อเลือก {best.k}</span>
						</div>
						<div className="vstat">
							<span className="mono">
								{f.saveSolar >= 0 ? "−" : "+"}
								{money(Math.abs(f.saveSolar))} ฿/ด.
							</span>
							<span>
								Solar 4kW {f.saveSolar >= 0 ? "ประหยัดกว่า" : "แพงกว่า"} TOU เดี่ยว (ผลิต {f2(solar4kKwhD)} · โหลดกลางวัน {f2(f.daytimeLoadD)} kWh/วัน)
							</span>
						</div>
						<div className="vstat">
							<span className="mono">{f2(a.eveningKwhD)} kWh/วัน</span>
							<span>พีคเย็น 17–22 ที่โซลาร์ช่วยไม่ได้ — ต้องมีแบตถึงจะตัดได้</span>
						</div>
					</div>
				</div>
			</section>
			<div className="notes">
				<b>หมายเหตุ</b>
				<ul>
					<li>
						สัดส่วน/ค่าเฉลี่ยคำนวณจากข้อมูลมิเตอร์จริง {a.n} จุด — Forecast
						ใช้ค่าเฉลี่ยวันธรรมดา/วันหยุดที่วัดได้จริง
					</li>
					<li>
						มิเตอร์ Tuya วัดได้ {f0(f.measuredMo)} kWh/เดือน เทียบบิล MEA เฉลี่ย{" "}
						{f0(C.MEA_MONTHLY_KWH)} — ควรเทียบมิเตอร์หน้าบ้าน 24 ชม. ว่า clamp
						ครอบคลุมทั้งบ้านหรือไม่
					</li>
					<li>
						โซลาร์ 4kW ผลิต {f2(solar4kKwhD)} kWh/วัน · จ–ศ{" "}
						{C.WEEKDAYS_MO} วันตัด On-Peak · ส–อา {C.WEEKENDS_MO} วันตัด Off-Peak · cap ด้วย load กลางวันจริง
					</li>
				</ul>
			</div>
			<footer>
				dashboard v10 · live on napats.dev · data {timeLabel(a.t0)} → {timeLabel(a.t1)} · forecast
				→ {dayMonth(fc.forecastEnd)}
			</footer>
		</>
	);
}
