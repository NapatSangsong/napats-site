import type { Finance } from "~/lib/energy-calc";
import { ENERGY_CONST } from "~/lib/energy-calc";
import { f0 } from "~/lib/energy-format";

/** Section — "Should we install 2 kW solar?" gauge.
 *  An arrow slides left (ไม่ติด) ↔ right (ติด) driven by `saveSolar` — the
 *  monthly ฿ that adding solar (incl. the ฿699 subscription) saves vs TOU-only.
 *  Recomputes with the rest of the dashboard, so flipping the finance basis
 *  toggle slides the arrow. */
export function InstallGauge({ f }: { f: Finance }) {
	const save = f.saveSolar; // ฿/month; >0 → worth installing
	const pos = Math.max(4, Math.min(96, 50 + save / 6)); // ±300฿/mo → ends
	const worth = save > 0;

	return (
		<section>
			<div className="sec-head">
				<span className="mono">◐</span>
				<h2>ควรติดโซลาร์ 2kW ไหม?</h2>
			</div>

			<div className="gauge-wrap">
				<div className="gauge-track">
					<div className="gauge-mid" />
					<div className={`gauge-arrow ${worth ? "yes" : "no"}`} style={{ left: `${pos}%` }}>
						<span className="g-val mono">
							{worth ? "+" : "−"}฿{f0(Math.abs(save))}/ด.
						</span>
						<span className="g-tip">▼</span>
					</div>
				</div>
				<div className="gauge-ends">
					<span>← ยังไม่ติด</span>
					<span>ติด 2kW →</span>
				</div>
			</div>

			<p className={`gauge-verdict ${worth ? "yes" : "no"}`}>
				{worth
					? `คุ้ม — โซลาร์ + TOU ประหยัดกว่า TOU เดี่ยว ~฿${f0(save)}/เดือน`
					: `ยังไม่คุ้ม — ที่โซลาร์ช่วยได้ยังไม่คุ้มค่าบริการ ฿${f0(ENERGY_CONST.BLUERING)}/เดือน (ขาด ~฿${f0(-save)}/เดือน)`}
			</p>
			<p className="gauge-note">
				คิดจากสัดส่วนโหลดจริง × เรต TOU · บ้านนี้ใช้ไฟกลางคืนเยอะ โซลาร์จึงช่วยพีคเย็นไม่ได้ — ต้องมีแบตเตอรี่ถึงจะคุ้มกว่านี้
			</p>
		</section>
	);
}
