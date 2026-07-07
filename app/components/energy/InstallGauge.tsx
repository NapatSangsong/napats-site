import type { Finance } from "~/lib/energy-calc";
import { ENERGY_CONST as C, touSolarScenario } from "~/lib/energy-calc";
import { f0 } from "~/lib/energy-format";

/** Section — "Should we install solar?" gauge, for 2kW and 4kW side by side.
 *  Each arrow slides left (ไม่ติด) ↔ right (ติด) driven by the monthly ฿ that
 *  adding that array (incl. its subscription) saves vs TOU-only. Recomputes with
 *  the rest of the dashboard, so flipping the finance basis toggle slides it. */
export function InstallGauge({ f, solarPr }: { f: Finance; solarPr: number }) {
	const solar4kKwhD = C.SOLAR_4K_KWP * C.SOLAR_PSH * solarPr;
	const save4 = f.cost2 - touSolarScenario(f, solar4kKwhD, C.SOLAR_4K_SUB).cost;
	const gauges = [
		{ kw: "2kW", save: f.saveSolar, sub: C.BLUERING },
		{ kw: "4kW", save: save4, sub: C.SOLAR_4K_SUB },
	];

	return (
		<section>
			<div className="sec-head">
				<span className="mono">◐</span>
				<h2>ควรติดโซลาร์ไหม? — 2kW vs 4kW</h2>
			</div>

			{gauges.map((g) => {
				const worth = g.save > 0;
				const pos = Math.max(4, Math.min(96, 50 + g.save / 6)); // ±300฿/mo → ends
				return (
					<div key={g.kw} className="gauge-wrap">
						<div className="bar-label">
							<b>โซลาร์ {g.kw} (sub ฿{f0(g.sub)}/ด.)</b>
							<span className="mono" style={{ color: worth ? "var(--good)" : "var(--bad)" }}>
								{worth ? "+" : "−"}฿{f0(Math.abs(g.save))}/ด.
							</span>
						</div>
						<div className="gauge-track">
							<div className="gauge-mid" />
							<div className={`gauge-arrow ${worth ? "yes" : "no"}`} style={{ left: `${pos}%` }}>
								<span className="g-val mono">
									{worth ? "+" : "−"}฿{f0(Math.abs(g.save))}/ด.
								</span>
								<span className="g-tip">▼</span>
							</div>
						</div>
						<div className="gauge-ends">
							<span>← ยังไม่ติด</span>
							<span>ติด {g.kw} →</span>
						</div>
						<p className={`gauge-verdict ${worth ? "yes" : "no"}`}>
							{worth
								? `คุ้ม — ${g.kw} + TOU ประหยัดกว่า TOU เดี่ยว ~฿${f0(g.save)}/เดือน`
								: `ยังไม่คุ้ม — ที่ ${g.kw} ช่วยได้ยังไม่คุ้มค่า sub ฿${f0(g.sub)}/เดือน (ขาด ~฿${f0(-g.save)}/เดือน)`}
						</p>
					</div>
				);
			})}

			<p className="gauge-note">
				คิดจากสัดส่วนโหลดจริง × เรต TOU · บ้านนี้ใช้ไฟกลางคืนเยอะ โซลาร์จึงช่วยพีคเย็นไม่ได้ — ต้องมีแบตเตอรี่ถึงจะคุ้มกว่านี้
			</p>
		</section>
	);
}
