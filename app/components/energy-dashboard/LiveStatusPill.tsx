import { clockLabel } from "~/lib/energy-format";

interface LiveStatusPillProps {
	offline: boolean;
	updatedAt: number | null;
	powerW: number | null;
}

export function LiveStatusPill({ offline, updatedAt, powerW }: LiveStatusPillProps) {
	return (
		<div className={`edash-pill ${offline ? "offline" : "live"}`}>
			<span className="dot" />
			{offline ? (
				<span>Offline</span>
			) : (
				<>
					{powerW !== null && (
						<span className="edash-mono" style={{ color: "var(--ink)" }}>
							{Math.round(powerW).toLocaleString()} W
						</span>
					)}
					{updatedAt && (
						<span style={{ opacity: 0.7 }}>{clockLabel(updatedAt)}</span>
					)}
				</>
			)}
		</div>
	);
}
