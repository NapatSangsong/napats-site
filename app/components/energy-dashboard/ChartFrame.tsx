import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

interface ChartFrameProps {
	children: ReactNode;
	size?: "sm" | "md" | "tall";
}

export function ChartFrame({ children, size = "md" }: ChartFrameProps) {
	const cls =
		size === "sm"
			? "edash-chart-frame-sm"
			: size === "tall"
				? "edash-chart-frame-tall"
				: "edash-chart-frame";
	return (
		<div className={cls}>
			<ResponsiveContainer width="100%" height="100%">
				{children as React.ReactElement}
			</ResponsiveContainer>
		</div>
	);
}
