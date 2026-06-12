import { useState } from "react";
import type { Analysis } from "~/lib/energy-calc";
import { ENERGY_CONST as C, dayNum, hourOf, isOnPeakHour, minuteOf, weekdayOf } from "~/lib/energy-calc";
import { f2, money } from "~/lib/energy-format";
import type { LiveData } from "./types";

/** Sum a day's per-hour kWh into TOU on/off buckets, up to (and including)
 *  `upToHour`. `lastHourFrac` scales the final bucket — used to compare
 *  yesterday fairly against today's partially-elapsed current hour. */
function splitDay(a: Analysis, day: number, wd: number, upToHour: number, lastHourFrac = 1) {
	let on = 0;
	let off = 0;
	for (let h = 0; h <= upToHour; h++) {
		let v = a.dh.get(day * 24 + h) ?? 0;
		if (h === upToHour) v *= lastHourFrac;
		if (isOnPeakHour(wd, h)) on += v;
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
	const curHour = hourOf(now);
	const wdT = weekdayOf(today);
	const wdY = weekdayOf(yest);

	// scrub hour — null = follow the current hour live; once dragged, it pins
	const [selHour, setSelHour] = useState<number | null>(null);
	const hour = selHour == null ? curHour : Math.min(selHour, curHour);
	const isLive = hour === curHour;

	// live tail beyond the last synced point — only when viewing the current hour
	const liveExtra =
		isLive && live && live.ts - a.t1 <= C.MAX_GAP_MS
			? Math.max(0, live.meter_kwh - a.lastMeter)
			: 0;
	const liveIsOn = isOnPeakHour(wdT, hour);

	const t = splitDay(a, today, wdT, hour);
	const onT = t.on + (liveIsOn ? liveExtra : 0);
	const offT = t.off + (liveIsOn ? 0 : liveExtra);
	// fair compare: while live, today's current hour is only partially elapsed,
	// so scale yesterday's same bucket by the elapsed-minute fraction
	const minFrac = isLive ? minuteOf(now) / 60 : 1;
	const y = splitDay(a, yest, wdY, hour, minFrac);

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
	// while live, the yesterday column is scaled to the same minute → show HH:MM
	const hhY = isLive ? `${String(hour).padStart(2, "0")}:${String(minuteOf(now)).padStart(2, "0")}` : hh;

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

			<div className="pt-slider">
				<span className="pt-slider-cap">
					เทียบสะสมถึง <b className="mono">{hh}</b>
					{isLive ? <span className="pt-now"> · ตอนนี้</span> : null}
				</span>
				<input
					type="range"
					min={0}
					max={curHour}
					step={1}
					value={hour}
					onChange={(e) => {
						// dragging to the right edge = back to live (otherwise it would
						// silently pin and stop following at the next hour boundary)
						const v = Number(e.target.value);
						setSelHour(v >= curHour ? null : v);
					}}
					aria-label="เลือกชั่วโมงที่จะเทียบ"
				/>
				<div className="pt-slider-ends">
					<span>00:00</span>
					<button
						type="button"
						className={`pt-reset${isLive ? " hidden" : ""}`}
						onClick={() => setSelHour(null)}
					>
						↺ ตอนนี้
					</button>
					<span>{String(curHour).padStart(2, "0")}:00</span>
				</div>
			</div>

			<table className="ptally">
				<thead>
					<tr>
						<th />
						<th>
							เมื่อวาน<small>~{hhY}</small>
						</th>
						<th>
							วันนี้<small>{isLive ? "ณ ตอนนี้" : `~${hh}`}</small>
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
