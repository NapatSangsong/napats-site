import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BillingCycle } from "~/lib/energy-calc";
import { cycleRangeLabel, cycleTitle } from "./derive";

interface Props {
	cycle: BillingCycle;
	canPrev: boolean;
	canNext: boolean;
	onPrev: () => void;
	onNext: () => void;
	/** วันที่ N/len ของรอบ — null for past cycles (complete) */
	progress: { elapsed: number; len: number } | null;
	loading: boolean;
}

/** Sticky hero: ‹ ก.ค. 2026 › + "รอบบิล 2 ก.ค. – 1 ส.ค." + cycle progress bar */
export function MonthSwitcher({ cycle, canPrev, canNext, onPrev, onNext, progress, loading }: Props) {
	return (
		<div className="ereport-switcher">
			<button
				type="button"
				className="ereport-chev"
				onClick={onPrev}
				disabled={!canPrev || loading}
				aria-label="รอบก่อนหน้า"
			>
				<ChevronLeft size={22} />
			</button>
			<div className={`ereport-switcher-mid${loading ? " is-loading" : ""}`}>
				<div className="ereport-switcher-title">{cycleTitle(cycle)}</div>
				<div className="ereport-switcher-sub">รอบบิล {cycleRangeLabel(cycle)}</div>
				{progress && (
					<div
						className="ereport-progress"
						role="progressbar"
						aria-valuenow={progress.elapsed}
						aria-valuemin={0}
						aria-valuemax={progress.len}
						aria-label={`วันที่ ${progress.elapsed} จาก ${progress.len} ของรอบ`}
					>
						<div
							className="ereport-progress-fill"
							style={{ width: `${Math.min(100, (progress.elapsed / progress.len) * 100)}%` }}
						/>
						<span className="ereport-progress-label mono">
							วันที่ {progress.elapsed}/{progress.len}
						</span>
					</div>
				)}
			</div>
			<button
				type="button"
				className="ereport-chev"
				onClick={onNext}
				disabled={!canNext || loading}
				aria-label="รอบถัดไป"
			>
				<ChevronRight size={22} />
			</button>
		</div>
	);
}
