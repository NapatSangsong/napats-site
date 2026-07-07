import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface KpiCardProps {
	label: string;
	value: string;
	sub?: ReactNode;
	delta?: string;
	deltaType?: "pos" | "neg" | "neu";
	accent?: string;
	icon?: ReactNode;
}

export function KpiCard({ label, value, sub, delta, deltaType = "neu", accent, icon }: KpiCardProps) {
	const [displayed, setDisplayed] = useState(value);
	const prevRef = useRef(value);

	// Simple fade-swap on value change instead of counting (values are strings like "฿1,847.00")
	useEffect(() => {
		if (value !== prevRef.current) {
			prevRef.current = value;
			setDisplayed(value);
		}
	}, [value]);

	return (
		<div
			className="edash-kpi"
			style={{ "--kpi-accent": accent ?? "var(--off)" } as React.CSSProperties}
		>
			<div className="edash-kpi-label">
				{icon && <span style={{ opacity: 0.7 }}>{icon}</span>}
				{label}
			</div>
			<div className="edash-kpi-value edash-mono">{displayed}</div>
			{sub && <div className="edash-kpi-sub">{sub}</div>}
			{delta && (
				<span className={`edash-kpi-delta ${deltaType}`}>{delta}</span>
			)}
		</div>
	);
}
