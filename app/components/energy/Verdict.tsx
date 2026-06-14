import type { Analysis, Finance, Forecast } from "~/lib/energy-calc";
import { ENERGY_CONST as C } from "~/lib/energy-calc";
import { dayMonth, f0, f2, money, timeLabel } from "~/lib/energy-format";

/** Section 08 — verdict & tipping point + notes + footer */
export function Verdict({ a, f, fc }: { a: Analysis; f: Finance; fc: Forecast }) {
	const head = f.viable
		? `Solar 2kW + BlueRing คุ้ม — ประหยัดเพิ่ม ${money(f.saveSolar)} ฿/เดือน`
		: `Solar 2kW + BlueRing ยังไม่คุ้ม — แพงขึ้น ${money(-f.saveSolar)} ฿/เดือน`;
	const text = f.viable
		? `โซลาร์วันธรรมดาตัด On-Peak หน่วยแพง ${f2(C.TOU_ON)}฿ ตรง ๆ ส่วนเสาร์–อาทิตย์ตัด Off-Peak มูลค่ารวมชนะค่า subscription ${f0(C.BLUERING)}฿/เดือน`
		: `ค่า subscription ${f0(C.BLUERING)}฿/เดือน มากกว่ามูลค่าไฟที่โซลาร์ตัดได้จริง ต้องใช้โซลาร์เองให้ถึง ${f2(f.tipKwhD)} kWh/วันก่อนถึงจะคุ้ม`;

	return (
		<>
			<section>
				<div className="sec-head">
					<span className="mono">08</span>
					<h2>คำตัดสิน &amp; Tipping Point</h2>
				</div>
				<div className={`verdict ${f.viable ? "viable" : "not-viable"}`}>
					<div className="big">
						<span className="pill">{f.viable ? "VIABLE ✓" : "NOT VIABLE ✗"}</span>
						<h2>{head}</h2>
					</div>
					<p>{text}</p>
					<div className="vstats">
						<div className="vstat">
							<span className="mono">{f2(f.tipKwhD)} kWh/วัน</span>
							<span>จุดคุ้มทุนโซลาร์ (ใช้เองจริงขั้นต่ำ เพื่อชนะค่า BlueRing)</span>
						</div>
						<div className="vstat">
							<span className="mono">{f2(f.usableD)} kWh/วัน</span>
							<span>โซลาร์ที่ใช้เองได้จริงตอนนี้ (daytime load {f2(f.daytimeLoadD)} kWh/วัน)</span>
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
						โซลาร์ {f0(C.SOLAR_KWH_D)} kWh/วันคงที่ · จ–ศ {C.WEEKDAYS_MO} วันตัด On-Peak · ส–อา{" "}
						{C.WEEKENDS_MO} วันตัด Off-Peak · cap ด้วย load กลางวันจริง
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
