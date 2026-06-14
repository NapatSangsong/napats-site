import { useState } from "react";
import type { Analysis } from "~/lib/energy-calc";
import { ENERGY_CONST as C, solarCurve } from "~/lib/energy-calc";
import { f1, f2, money } from "~/lib/energy-format";

/** Round-trip battery efficiency (charge → store → discharge) */
const RT_EFF = 0.9;

/** Section — battery what-if: pairs a hypothetical PV size with a battery and
 *  asks the question the rest of the dashboard keeps raising — "the evening
 *  peak is the expensive part and solar alone can't touch it; would a battery
 *  close the loop?". All client-side, from the measured hourly profile.
 *
 *  Model (deliberately simple, stated in the UI):
 *   surplus  = Σ max(0, prod_h − load_h)         (daytime energy left over)
 *   usable   = min(battery, surplus) × 0.9       (round-trip losses)
 *   offset   = min(usable, evening load 17–22)   (discharged into the peak)
 *   ฿/mo     = offset × (22 days on-peak + 8 days off-peak rates)
 */
export function BatteryWhatIf({ a }: { a: Analysis }) {
	const [solarKw, setSolarKw] = useState(2);
	const [battKwh, setBattKwh] = useState(5);
	const [costPerKwh, setCostPerKwh] = useState(8000);

	// solarCurve() is shaped for the 2 kW reference system → scale linearly
	const sol = solarCurve();
	const scale = solarKw / 2;
	let direct = 0;
	let surplus = 0;
	for (let h = 0; h < 24; h++) {
		const prod = sol[h] * scale;
		const load = a.prof[h] ?? 0;
		direct += Math.min(prod, load);
		surplus += Math.max(0, prod - load);
	}
	const stored = Math.min(battKwh, surplus);
	const usable = stored * RT_EFF;
	const evening = a.eveningKwhD;
	const offsetEvening = Math.min(usable, evening);
	const eveningPct = evening > 0 ? (offsetEvening / evening) * 100 : 0;

	// ฿/month: weekday evenings are on-peak, weekend evenings off-peak
	const saveBattMo = offsetEvening * (C.WEEKDAYS_MO * C.TOU_ON + C.WEEKENDS_MO * C.TOU_OFF);
	const battCost = battKwh * costPerKwh;
	const paybackYears = saveBattMo > 0 ? battCost / saveBattMo / 12 : Infinity;

	const verdict =
		battKwh === 0
			? "เลื่อนเพิ่มขนาดแบตเพื่อดูผล"
			: surplus < 0.5
				? `โซลาร์ ${f1(solarKw)}kW เหลือ surplus แค่ ${f2(surplus)} kWh/วัน — แบตแทบไม่มีไฟให้เก็บ ลองเพิ่มขนาดโซลาร์`
				: stored < battKwh * 0.6
					? `แบต ${f1(battKwh)} kWh ใหญ่กว่า surplus ที่มี (${f2(surplus)} kWh/วัน) — จ่ายความจุที่ไม่ได้ใช้ ลองลดขนาดแบตหรือเพิ่มโซลาร์`
					: paybackYears > 10
						? `คืนทุนช้า (~${f1(paybackYears)} ปี) — ราคาแบตต่อ kWh ยังสูงไปสำหรับ surplus ระดับนี้`
						: `น่าสนใจ — กินพีคเย็นได้ ${Math.round(eveningPct)}% คืนทุน ~${f1(paybackYears)} ปี`;

	const slider = (
		label: string,
		value: number,
		set: (v: number) => void,
		min: number,
		max: number,
		step: number,
		unit: string,
		fmt: (v: number) => string = f1,
	) => (
		<div className="bw-row">
			<span className="bw-label">{label}</span>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => set(Number(e.target.value))}
				aria-label={label}
			/>
			<b className="mono">
				{fmt(value)}
				<small> {unit}</small>
			</b>
		</div>
	);

	return (
		<section>
			<div className="sec-head house-head">
				<span className="mono">🔋</span>
				<h2>จำลองแบตเตอรี่ — กินพีคเย็นด้วยโซลาร์</h2>
				<div className="house-badges">
					<span className="solar-sim">what-if · ยังไม่ติดจริง</span>
				</div>
			</div>

			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
				{[
					{ label: "2kW + 5kWh", kw: 2, batt: 5 },
					{ label: "4kW + 5kWh", kw: 4, batt: 5 },
					{ label: "4kW + 10kWh", kw: 4, batt: 10 },
				].map((p) => {
					const active = solarKw === p.kw && battKwh === p.batt;
					return (
						<button
							key={p.label}
							type="button"
							onClick={() => {
								setSolarKw(p.kw);
								setBattKwh(p.batt);
							}}
							style={{
								appearance: "none",
								border: `1px solid ${active ? "var(--good)" : "var(--line)"}`,
								background: active ? "rgba(90,224,143,0.12)" : "var(--night-2)",
								color: active ? "var(--good)" : "var(--ink-dim)",
								borderRadius: 99,
								padding: "5px 12px",
								font: "inherit",
								fontSize: "0.78rem",
								fontWeight: 600,
								cursor: "pointer",
							}}
						>
							{p.label}
						</button>
					);
				})}
			</div>

			<div className="bw-sliders">
				{slider("โซลาร์", solarKw, setSolarKw, 1, 6, 0.5, "kW")}
				{slider("แบตเตอรี่", battKwh, setBattKwh, 0, 15, 0.5, "kWh")}
				{slider("ราคาแบต", costPerKwh, setCostPerKwh, 4000, 15000, 500, "฿/kWh", (v) => money(v).replace(".00", ""))}
			</div>

			<div className="bw-flow mono">
				surplus กลางวัน {f2(surplus)} → เก็บ {f2(stored)} → ใช้ได้ {f2(usable)} (×{RT_EFF}) → กินพีคเย็น{" "}
				{f2(offsetEvening)} / {f2(evening)} kWh
			</div>

			<div className="house-stats" style={{ marginTop: 12 }}>
				<div className="house-chip">
					<span className="mono lead" style={{ color: "#5ae08f" }}>
						฿{money(saveBattMo)}
					</span>
					<span>ประหยัดเพิ่ม/เดือน (จากแบต)</span>
				</div>
				<div className="house-chip">
					<span className="mono">{Math.round(eveningPct)}%</span>
					<span>ของพีคเย็น 17–22 ที่กินได้</span>
				</div>
				<div className="house-chip">
					<span className="mono">
						{Number.isFinite(paybackYears) ? f1(paybackYears) : "∞"}
						<small> ปี</small>
					</span>
					<span>คืนทุนแบต (฿{money(battCost)})</span>
				</div>
			</div>

			<p className="gauge-note">📐 {verdict}</p>
			<p className="pt-note">
				โมเดลอย่างง่าย: ใช้โปรไฟล์โหลดเฉลี่ยจริง + เส้นผลิตโซลาร์มาตรฐาน · ไม่คิดข้อจำกัดกำลังชาร์จ/อายุแบต ·
				ค่าไฟพีคเย็น = จ–ศ on-peak ฿{f2(C.TOU_ON)} / ส–อา ฿{f2(C.TOU_OFF)}
			</p>
		</section>
	);
}
