import type { BillingCycle, CycleOutlook, Forecast } from "~/lib/energy-calc";
import { CALIBRATION } from "~/lib/energy-calc";
import { dayMonth, dayOnly, f0, f1 } from "~/lib/energy-format";
import { ChartTip, useChartTip } from "./useChartTip";

const KIND_CLS = { actual: "fb-actual", partial: "fb-partial", today: "fb-today", fc: "fb-fc" } as const;

/** Section 04 — daily kWh forecast for the CURRENT billing cycle (ตัดวันที่ 2).
 *  Bars are scoped to this cycle; the totals are the one-cycle projection
 *  (outlook), the same figure /energy/report and the dashboard show. */
export function ForecastChart({
	fc,
	rawMeter,
	outlook,
	cycle,
}: { fc: Forecast; rawMeter: number; outlook: CycleOutlook; cycle: BillingCycle }) {
	const days = fc.days.filter((x) => x.day >= cycle.startDay && x.day <= cycle.endDay);
	const mx = Math.max(...days.map((x) => x.kwh), 0.1) || 1;
	const start = days[0]?.day ?? cycle.startDay;
	// The physical Tuya meter reads RAW (it under-reads; calibration only scales
	// our consumption estimate). So the meter-face displays use rawMeter, and the
	// projection adds the remaining CALIBRATED kWh converted back to raw units
	// (all future is post-boundary → divide by factorAfter).
	const meterEndRaw = rawMeter + fc.futureKwh / CALIBRATION.factorAfter;
	const { tip, point, surface, wrapRef } = useChartTip();

	return (
		<section>
			<div className="sec-head">
				<span className="mono">04</span>
				<h2>Forecast รายวัน — รอบบิลนี้ → {dayMonth(fc.forecastEnd)}</h2>
			</div>
			<div className="bar-label">
				<b>การใช้ไฟรายวัน (kWh)</b>
				<span className="mono">
					จ–ศ {f1(fc.wdAvg)} · ส–อา {f1(fc.weAvg)} kWh/วัน
				</span>
			</div>
			<div className="fchart" ref={wrapRef} style={{ position: "relative" }} {...surface}>
				{days.map((x) => {
					const h = Math.max((x.kwh / mx) * 100, 2);
					const we = x.weekend && x.kind !== "today" ? " fb-we" : "";
					return (
						<div className="fcol" key={x.day} {...point(`${dayMonth(x.day)} · ${f1(x.kwh)} kWh`)}>
							<div
								className={`fbar ${KIND_CLS[x.kind]}${we}`}
								style={{ height: `${h.toFixed(1)}%` }}
							/>
						</div>
					);
				})}
				<ChartTip tip={tip} />
			</div>
			<div className="flabels">
				{days.map((x) => (
					<div key={x.day} className={`flabel${x.weekend ? " we" : ""}`}>
						{dayOnly(x.day)}
					</div>
				))}
			</div>
			<div className="flegend">
				<span>
					<i style={{ background: "var(--off)" }} />
					วัดจริง
				</span>
				<span>
					<i style={{ background: "var(--sun)" }} />
					วันนี้ (จริง+คาดส่วนที่เหลือ)
				</span>
				<span>
					<i style={{ background: "#2D5DB0" }} />
					วันแรก (ข้อมูลบางส่วน)
				</span>
				<span>
					<i
						style={{
							background: "repeating-linear-gradient(45deg,#3DD6C355 0 5px,#3DD6C322 5px 10px)",
							border: "1px dashed #3DD6C388",
						}}
					/>
					Forecast
				</span>
			</div>
			<div className="vstats" style={{ marginTop: 24 }}>
				<div className="vstat">
					<span className="mono">~{f0(outlook.kwh)} kWh</span>
					<span>
						คาดสิ้นรอบบิลนี้ {dayMonth(start)} → {dayMonth(fc.forecastEnd)}
					</span>
				</div>
				<div className="vstat">
					<span className="mono">~{f0(meterEndRaw)} kWh</span>
					<span>
						เลขมิเตอร์ Tuya ที่คาดภายใน {dayMonth(fc.forecastEnd)} (ตอนนี้ {f1(rawMeter)})
					</span>
				</div>
				<div className="vstat">
					<span className="mono">~{f0(outlook.touBaht)} ฿</span>
					<span>ค่าไฟสิ้นรอบถ้าเป็น TOU (Flat จะ ~{f0(outlook.flatBaht)} ฿)</span>
				</div>
			</div>
		</section>
	);
}
