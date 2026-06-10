export type StepState = "wait" | "run" | "done" | "fail";

export const STEP_LABELS = [
	"เชื่อมต่อมิเตอร์ Tuya…",
	"โหลดประวัติจากคลังข้อมูล…",
	"คำนวณโปรไฟล์ + TOU + Forecast…",
	"วาดกราฟ…",
] as const;

const ICON: Record<StepState, string> = { wait: "○", run: "◐", done: "✓", fail: "✗" };

/** Full-area loading sequence: progress ring + ⚡ + mono step checklist.
 *  Steps reflect the real fetch/calc pipeline (no fake timings). */
export function LoadingOverlay({ steps, fading }: { steps: StepState[]; fading: boolean }) {
	return (
		<div className={`overlay${fading ? " fade" : ""}`} aria-hidden={fading}>
			<div className="overlay-inner">
				<div className="ringwrap">
					<div className="ring" />
					<div className="bolt">⚡</div>
				</div>
				<div className="steps">
					{STEP_LABELS.map((label, i) => (
						<div key={label} className={`step ${steps[i]}`}>
							<span className="st">{ICON[steps[i]]}</span>
							{label}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
