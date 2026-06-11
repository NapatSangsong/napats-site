import type { Analysis } from "~/lib/energy-calc";
import { ENERGY_CONST as C, dayNum, hourOf, weekdayOf } from "~/lib/energy-calc";
import { f2, money } from "~/lib/energy-format";
import type { LiveData } from "./types";

/** Sum a day's per-hour kWh into TOU on/off buckets, up to (and including)
 *  `upToHour`. On-peak = weekday 09:00–21:59; everything else off-peak. */
function splitDay(a: Analysis, day: number, wd: number, upToHour: number) {
	let on = 0;
	let off = 0;
	for (let h = 0; h <= upToHour; h++) {
		const v = a.dh.get(day * 24 + h) ?? 0;
		if (wd < 5 && h >= 9 && h < 22) on += v;
		else off += v;
	}
	return { on, off };
}

/** Section — realtime per-TOU-period tally: units + accumulated ฿ for today
 *  (up to now) vs yesterday (same time), with a solar-offset row that reads 0
 *  until panels are actually installed. */
export function PeriodTally({ a, live }: { a: Analysis; live: LiveData | null }) {
	const now = Date.now();
	const today = dayNum(now);
	const yest = today - 1;
	const hour = hourOf(now);
	const wdT = weekdayOf(today);
	const wdY = weekdayOf(yest);

	// live tail beyond the last synced point, attributed to the current TOU class
	const liveExtra =
		live && live.ts - a.t1 <= C.MAX_GAP_MS ? Math.max(0, live.meter_kwh - a.lastMeter) : 0;
	const liveIsOn = wdT < 5 && hour >= 9 && hour < 22;

	const t = splitDay(a, today, wdT, hour);
	const onT = t.on + (liveIsOn ? liveExtra : 0);
	const offT = t.off + (liveIsOn ? 0 : liveExtra);
	const y = splitDay(a, yest, wdY, hour);

	// solar offset — NOT installed yet → produces 0, offsets ฿0 (placeholder)
	const solarT = 0;
	const solarY = 0;

	const costOnT = onT * C.TOU_ON;
	const costOffT = offT * C.TOU_OFF;
	const costOnY = y.on * C.TOU_ON;
	const costOffY = y.off * C.TOU_OFF;
	const totKwhT = onT + offT - solarT;
	const totKwhY = y.on + y.off - solarY;
	const totCostT = costOnT + costOffT - solarT * C.TOU_ON;
	const totCostY = costOnY + costOffY - solarY * C.TOU_ON;

	// yesterday's full-day reference (whole day, all hours)
	const onYf = a.dailyOn.get(yest) ?? 0;
	const offYf = a.dailyOff.get(yest) ?? 0;
	const fullKwhY = onYf + offYf;
	const fullCostY = onYf * C.TOU_ON + offYf * C.TOU_OFF;

	const deltaPct = totCostY > 0 ? ((totCostT - totCostY) / totCostY) * 100 : 0;
	const hh = `${String(hour).padStart(2, "0")}:00`;

	const cell = (kwh: number, cost: number) => (
		<>
			<b className="mono">{f2(kwh)}</b>
			<small> kWh</small>
			<span className="pt-baht">฿{money(cost)}</span>
		</>
	);

	return (
		<section>
			<div className="sec-head">
				<span className="mono">◷</span>
				<h2>สรุปรายช่วง เรียลไทม์ — วันนี้ vs เมื่อวาน</h2>
			</div>

			<table className="ptally">
				<thead>
					<tr>
						<th />
						<th>
							เมื่อวาน<small>~{hh}</small>
						</th>
						<th>
							วันนี้<small>ณ ตอนนี้</small>
						</th>
					</tr>
				</thead>
				<tbody>
					<tr className="pt-on">
						<th>
							On-Peak<small>฿{money(C.TOU_ON)}</small>
						</th>
						<td>{cell(y.on, costOnY)}</td>
						<td>{cell(onT, costOnT)}</td>
					</tr>
					<tr className="pt-off">
						<th>
							Off-Peak<small>฿{money(C.TOU_OFF)}</small>
						</th>
						<td>{cell(y.off, costOffY)}</td>
						<td>{cell(offT, costOffT)}</td>
					</tr>
					<tr className="pt-solar">
						<th>
							โซลาร์หักล้าง<small>ยังไม่ติด</small>
						</th>
						<td>
							−{f2(solarY)}<small> kWh</small>
							<span className="pt-baht">−฿0</span>
						</td>
						<td>
							−{f2(solarT)}<small> kWh</small>
							<span className="pt-baht">−฿0</span>
						</td>
					</tr>
					<tr className="pt-total">
						<th>รวมสุทธิ</th>
						<td>{cell(totKwhY, totCostY)}</td>
						<td>{cell(totKwhT, totCostT)}</td>
					</tr>
				</tbody>
			</table>

			<p className="pt-note">
				เทียบ ณ ราวเวลาเดียวกัน — วันนี้{" "}
				<b className={totCostT >= totCostY ? "pt-up" : "pt-down"}>
					{totCostT >= totCostY ? "มากกว่า" : "น้อยกว่า"} {Math.abs(deltaPct).toFixed(0)}%
				</b>{" "}
				· เมื่อวานทั้งวัน {f2(fullKwhY)} kWh ฿{money(fullCostY)} · โซลาร์ยังไม่ติด → ผลิต 0 (พร้อมหักล้างอัตโนมัติเมื่อติดจริง)
			</p>
		</section>
	);
}
