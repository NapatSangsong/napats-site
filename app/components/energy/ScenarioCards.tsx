import type { Analysis, Finance } from "~/lib/energy-calc";
import { ENERGY_CONST as C, batteryEveningSaving, flatAvgRate, touSolarScenario } from "~/lib/energy-calc";
import { f0, f1, f2, money } from "~/lib/energy-format";

const SOLAR_4K_SUB = 1399; // ฿/mo subscription for the 4kW plan
const BATT_KWH = 5; // modelled battery size
const BATT_COST_PER_KWH = 8000; // ฿/kWh (matches BatteryWhatIf default) — capital, NOT in the bill

/** Section 06 — Baseload & Evening Peak */
export function BaseloadStats({ a }: { a: Analysis }) {
	const baseKwhD = a.baseloadKw * 24;
	const basePct = a.kwhDay ? (baseKwhD / a.kwhDay) * 100 : 0;
	return (
		<section>
			<div className="sec-head">
				<span className="mono">06</span>
				<h2>Baseload &amp; Evening Peak</h2>
			</div>
			<div className="vstats">
				<div className="vstat">
					<span className="mono">{f2(a.baseloadKw)} kW ตลอดเวลา</span>
					<span>
						Baseload (ตู้เย็น/standby) = {f1(baseKwhD)} kWh/วัน · {basePct.toFixed(0)}% ของการใช้ —
						ถ้าสูงผิดปกติ มีอะไรกินไฟเงียบ ๆ อยู่ค่ะ
					</span>
				</div>
				<div className="vstat">
					<span className="mono">{f2(a.eveningKwhD)} kWh/วัน</span>
					<span>Evening Peak 17–22 น. — แพงสุดและโซลาร์ช่วยไม่ได้</span>
				</div>
				<div className="vstat">
					<span className="mono">~{f1(a.eveningKwhD)} kWh</span>
					<span>ขนาดแบตเตอรี่ขั้นต่ำถ้าอยากเก็บโซลาร์ไว้ cover ช่วง Evening Peak ในอนาคต</span>
				</div>
			</div>
		</section>
	);
}

/** Section 07 — scenario cost cards */
export function ScenarioCards({ f, a }: { f: Finance; a: Analysis }) {
	const solar4kKwhD = 4 * C.SOLAR_PSH * C.SOLAR_PR; // 4kWp × PSH × PR
	const s4 = touSolarScenario(f, solar4kKwhD, SOLAR_4K_SUB);
	const save4 = f.cost2 - s4.cost; // vs TOU baseline
	// Scenario 5: 4kW + 5kWh battery — shifts daytime surplus into the evening
	// peak. EXCLUDED from minCost / the "ถูกสุด" badge: this figure does NOT
	// include the battery's ~฿40k capital, so flagging it cheapest is unfair.
	const saveBatt = batteryEveningSaving(a, 4, BATT_KWH);
	const cost5 = s4.cost - saveBatt;
	const minCost = Math.min(f.cost1, f.cost2, f.cost3, s4.cost);
	return (
		<section>
			<div className="sec-head">
				<span className="mono">07</span>
				<h2>เปรียบเทียบค่าไฟรายเดือน</h2>
			</div>
			<div className="cards">
				<div className={`card${f.cost1 === minCost ? " best" : ""}`}>
					{f.cost1 === minCost && <span className="best-badge">ถูกสุด</span>}
					<div className="tag">Scenario 1 · Before</div>
					<h3>มิเตอร์ปกติ (Flat ขั้นบันได)</h3>
					<div className="cost mono">
						{money(f.cost1)}
						<small>฿/เดือน</small>
					</div>
					<div className="delta minus">+{money(f.saveTou)} ฿ แพงกว่า baseline</div>
					<div className="kv">
						<div>
							<span>ขั้นบันได + Ft เฉลี่ย {f2(flatAvgRate(f.monthlyKwh))}฿/kWh</span>
							<span className="mono">{f0(f.monthlyKwh)} kWh</span>
						</div>
					</div>
				</div>
				<div className={`card${f.cost2 === minCost ? " best" : ""}`}>
					{f.cost2 === minCost && <span className="best-badge">ถูกสุด</span>}
					<div className="tag">Scenario 2 · Baseline</div>
					<h3>TOU Premium</h3>
					<div className="cost mono">
						{money(f.cost2)}
						<small>฿/เดือน</small>
					</div>
					<div className="delta zero">baseline · ประหยัดจาก Flat {money(f.saveTou)} ฿/ด.</div>
					<div className="kv">
						<div>
							<span>
								On-Peak {f0(f.onKwh)} × {f2(C.TOU_ON)}
							</span>
							<span className="mono">{money(f.onKwh * C.TOU_ON)}</span>
						</div>
						<div>
							<span>
								Off-Peak {f0(f.offKwh)} × {f2(C.TOU_OFF)}
							</span>
							<span className="mono">{money(f.offKwh * C.TOU_OFF)}</span>
						</div>
						<div>
							<span>ค่าบริการ TOU</span>
							<span className="mono">{f2(C.TOU_FIXED)}</span>
						</div>
					</div>
				</div>
				<div className={`card${f.cost3 === minCost ? " best" : ""}`}>
					{f.cost3 === minCost && <span className="best-badge">ถูกสุด</span>}
					<div className="tag">Scenario 3</div>
					<h3>TOU + Solar 2kW (BlueRing)</h3>
					<div className="cost mono">
						{money(f.cost3)}
						<small>฿/เดือน</small>
					</div>
					<div className={`delta ${f.saveSolar >= 0 ? "plus" : "minus"}`}>
						{f.saveSolar >= 0 ? `−${money(f.saveSolar)}` : `+${money(-f.saveSolar)}`} ฿ เทียบ TOU
						อย่างเดียว
					</div>
					<div className="kv">
						<div>
							<span>On-Peak เหลือ</span>
							<span className="mono">{f0(f.remOn)} kWh</span>
						</div>
						<div>
							<span>Off-Peak เหลือ</span>
							<span className="mono">{f0(f.remOff)} kWh</span>
						</div>
						<div>
							<span>BlueRing</span>
							<span className="mono">{f2(C.BLUERING)}</span>
						</div>
					</div>
				</div>
				<div className={`card${s4.cost === minCost ? " best" : ""}`}>
					{s4.cost === minCost && <span className="best-badge">ถูกสุด</span>}
					<div className="tag">Scenario 4</div>
					<h3>TOU + Solar 4kW</h3>
					<div className="cost mono">
						{money(s4.cost)}
						<small>฿/เดือน</small>
					</div>
					<div className={`delta ${save4 >= 0 ? "plus" : "minus"}`}>
						{save4 >= 0 ? `−${money(save4)}` : `+${money(-save4)}`} ฿ เทียบ TOU อย่างเดียว
					</div>
					<div className="kv">
						<div>
							<span>On-Peak เหลือ</span>
							<span className="mono">{f0(s4.remOn)} kWh</span>
						</div>
						<div>
							<span>Off-Peak เหลือ</span>
							<span className="mono">{f0(s4.remOff)} kWh</span>
						</div>
						<div>
							<span>โซลาร์ 4kW ({f1(solar4kKwhD)} kWh/วัน) + sub</span>
							<span className="mono">{f2(SOLAR_4K_SUB)}</span>
						</div>
					</div>
				</div>
				<div className="card">
					<div className="tag">Scenario 5</div>
					<h3>TOU + Solar 4kW + Batt {BATT_KWH}kWh</h3>
					<div className="cost mono">
						{money(cost5)}
						<small>฿/เดือน</small>
					</div>
					<div className="delta plus">−{money(f.cost2 - cost5)} ฿ เทียบ TOU อย่างเดียว</div>
					<div className="kv">
						<div>
							<span>แบตกินพีคเย็นเพิ่ม (เก็บ surplus กลางวัน)</span>
							<span className="mono">−{money(saveBatt)}/ด.</span>
						</div>
						<div>
							<span>⚠️ ยังไม่รวมค่าแบต ~{money(BATT_KWH * BATT_COST_PER_KWH)}</span>
							<span className="mono">ดู “จำลองแบตเตอรี่”</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
