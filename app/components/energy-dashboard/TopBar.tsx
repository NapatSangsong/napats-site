import { Moon, RefreshCw, Sun, Zap } from "lucide-react";
import type { DashTheme } from "~/hooks/useDashboardTheme";
import {
	SOLAR_CASE_LABEL,
	type SolarCase,
} from "~/hooks/useEnergyData";
import { LiveStatusPill } from "./LiveStatusPill";
import { clockLabel } from "~/lib/energy-format";

interface TopBarProps {
	theme: DashTheme;
	onToggleTheme: () => void;
	liveOffline: boolean;
	liveUpdatedAt: number | null;
	powerW: number | null;
	measured: boolean;
	onSetMeasured: (v: boolean) => void;
	solarCase: SolarCase;
	onSetSolarCase: (c: SolarCase) => void;
	syncing: boolean;
	syncedAt: number | null;
	onSync: () => void;
}

export function TopBar({
	theme,
	onToggleTheme,
	liveOffline,
	liveUpdatedAt,
	powerW,
	measured,
	onSetMeasured,
	solarCase,
	onSetSolarCase,
	syncing,
	syncedAt,
	onSync,
}: TopBarProps) {
	return (
		<div className="edash-topbar">
			<div className="edash-topbar-title">
				<span className="brand-dot" />
				<Zap size={15} style={{ color: "var(--sun)" }} />
				Energy Dashboard
			</div>

			<LiveStatusPill offline={liveOffline} updatedAt={liveUpdatedAt} powerW={powerW} />

			<div className="edash-topbar-spacer" />

			<div className="edash-topbar-controls">
				<span className="edash-seg-label">ฐานข้อมูล</span>
				<div className="edash-seg">
					<button
						type="button"
						className={!measured ? "on" : ""}
						onClick={() => measured && onSetMeasured(false)}
					>
						บิล MEA
					</button>
					<button
						type="button"
						className={measured ? "on" : ""}
						onClick={() => !measured && onSetMeasured(true)}
					>
						วัดจริง
					</button>
				</div>

				<span className="edash-seg-label">Solar PR</span>
				<div className="edash-seg">
					{(Object.keys(SOLAR_CASE_LABEL) as SolarCase[]).map((c) => (
						<button
							key={c}
							type="button"
							className={solarCase === c ? "on" : ""}
							onClick={() => solarCase !== c && onSetSolarCase(c)}
						>
							{SOLAR_CASE_LABEL[c]}
						</button>
					))}
				</div>

				<button
					type="button"
					className="edash-icon-btn"
					onClick={onSync}
					disabled={syncing}
					title="ดึงข้อมูลล่าสุดจากมิเตอร์"
				>
					<span className={syncing ? "edash-spin" : ""}>
						<RefreshCw size={13} />
					</span>
					{syncing ? "Syncing…" : "Sync"}
					{syncedAt && !syncing && (
						<span style={{ opacity: 0.6, fontSize: "0.68rem" }}>
							{clockLabel(syncedAt)}
						</span>
					)}
				</button>

				<button
					type="button"
					className="edash-icon-btn"
					onClick={onToggleTheme}
					title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
				>
					{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
				</button>
			</div>
		</div>
	);
}
