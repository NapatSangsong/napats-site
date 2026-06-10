import type { Analysis, Forecast } from "~/lib/energy-calc";
import { dayMonth, dayOnly, f0, f1 } from "~/lib/energy-format";

const KIND_CLS = { actual: "fb-actual", partial: "fb-partial", today: "fb-today", fc: "fb-fc" } as const;

/** Section 04 — daily kWh forecast to end of month. Port of build_fchart() in v10. */
export function ForecastChart({ fc, a }: { fc: Forecast; a: Analysis }) {
	const mx = Math.max(...fc.days.map((x) => x.kwh)) || 1;
	const start = fc.days[0]?.day ?? 0;

	return (
		<section>
			<div className="sec-head">
				<span className="mono">04</span>
				<h2>Forecast รายวัน → {dayMonth(fc.forecastEnd)}</h2>
			</div>
			<div className="bar-label">
				<b>การใช้ไฟรายวัน (kWh)</b>
				<span className="mono">
					จ–ศ {f1(fc.wdAvg)} · ส–อา {f1(fc.weAvg)} kWh/วัน
				</span>
			</div>
			<div className="fchart">
				{fc.days.map((x) => {
					const h = Math.max((x.kwh / mx) * 100, 2);
					const we = x.weekend && x.kind !== "today" ? " fb-we" : "";
					return (
						<div className="fcol" key={x.day}>
							<div
								className={`fbar ${KIND_CLS[x.kind]}${we}`}
								style={{ height: `${h.toFixed(1)}%` }}
								title={`${dayMonth(x.day)} · ${f1(x.kwh)} kWh`}
							/>
						</div>
					);
				})}
			</div>
			<div className="flabels">
				{fc.days.map((x) => (
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
					<span className="mono">{f0(fc.totalKwh)} kWh</span>
					<span>
						รวมทั้งช่วง {dayMonth(start)} → {dayMonth(fc.forecastEnd)} ({fc.nDays} วัน)
					</span>
				</div>
				<div className="vstat">
					<span className="mono">~{f0(fc.meterEnd)} kWh</span>
					<span>
						เลขมิเตอร์ Tuya ที่คาดภายใน {dayMonth(fc.forecastEnd)} (ตอนนี้ {f1(a.lastMeter)})
					</span>
				</div>
				<div className="vstat">
					<span className="mono">~{f0(fc.touCost)} ฿</span>
					<span>ค่าไฟช่วงนี้ถ้าเป็น TOU (Flat จะ ~{f0(fc.flatCost)} ฿)</span>
				</div>
			</div>
		</section>
	);
}
