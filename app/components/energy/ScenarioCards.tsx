import type { Analysis, Finance } from "~/lib/energy-calc";
import { ENERGY_CONST as C } from "~/lib/energy-calc";
import { f0, f1, f2, money } from "~/lib/energy-format";

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

/** Section 07 — 3 scenario cost cards */
export function ScenarioCards({ f }: { f: Finance }) {
	return (
		<section>
			<div className="sec-head">
				<span className="mono">07</span>
				<h2>เปรียบเทียบค่าไฟรายเดือน</h2>
			</div>
			<div className="cards">
				<div className="card">
					<div className="tag">Scenario 1 · Before</div>
					<h3>มิเตอร์ปกติ (Flat {f2(C.FLAT_RATE)}฿)</h3>
					<div className="cost mono">
						{money(f.cost1)}
						<small>฿/เดือน</small>
					</div>
					<div className="delta minus">+{money(f.saveTou)} ฿ แพงกว่า baseline</div>
					<div className="kv">
						<div>
							<span>คิดทุกหน่วยเท่ากัน</span>
							<span className="mono">{f0(f.monthlyKwh)} kWh</span>
						</div>
					</div>
				</div>
				<div className="card">
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
				<div className={`card${f.viable ? " best" : ""}`}>
					{f.viable && <span className="best-badge">ถูกสุด</span>}
					<div className="tag">Scenario 3</div>
					<h3>TOU + Solar 2kW (BlueRing)</h3>
					<div className="cost mono">
						{money(f.cost3)}
						<small>฿/เดือน</small>
					</div>
					<div className={`delta ${f.viable ? "plus" : "minus"}`}>
						{f.viable ? `−${money(f.saveSolar)}` : `+${money(-f.saveSolar)}`} ฿ เทียบ TOU
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
			</div>
		</section>
	);
}
