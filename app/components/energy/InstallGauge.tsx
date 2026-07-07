import type { Finance } from "~/lib/energy-calc";
import { ENERGY_CONST as C } from "~/lib/energy-calc";
import { f0 } from "~/lib/energy-format";

/** Section — "Should we install solar?" gauge for the 4kW system. The arrow
 *  slides left (ไม่ติด) ↔ right (ติด) driven by the monthly ฿ that the array
 *  (incl. its subscription) saves vs TOU-only (= f.saveSolar, now the 4kW
 *  model). Recomputes with the finance basis toggle. */
export function InstallGauge({ f }: { f: Finance }) {
	const gauges = [{ kw: "4kW", save: f.saveSolar, sub: C.SOLAR_4K_SUB }];

	return (
		<section>
			<div className="sec-head">
				<span className="mono">◐</span>
				<h2>ควรติดโซลาร์ไหม? — 4kW</h2>
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
