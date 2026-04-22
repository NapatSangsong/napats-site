/**
 * Library — grid of course cards with monogram covers and filter bar.
 * Matches the design's LibraryScreen: pure typography, no thumbnails.
 */
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/learning.library";
import { useTheme } from "./learning";
import { createServiceClient } from "~/lib/supabase.server";
import { TopBar } from "~/components/learning/TopBar";
import {
	Tracked,
	TrackedButton,
	ProgressBar,
} from "~/components/learning/primitives";

export function meta() {
	return [{ title: "Napat · Learning · Library" }];
}

interface LessonProgressRow {
	lesson_id: string;
	status: string;
	scroll_percent: number;
}

interface CourseData {
	id: string;
	slug: string;
	title: string;
	subtitle: string | null;
	source: string;
	cover_monogram: string | null;
	estimated_minutes: number | null;
	lessons: { id: string; status: string }[];
	lesson_progress: LessonProgressRow[];
}

export async function loader({ context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	let courses: CourseData[] = [];

	try {
		const supabase = createServiceClient(env);
		const { data } = await supabase
			.from("courses")
			.select(`id, slug, title, subtitle, source, cover_monogram, estimated_minutes, lessons(id, status),
				lesson_progress:lessons(lesson_progress(lesson_id, status, scroll_percent))`)
			.eq("archived", false)
			.order("updated_at", { ascending: false });

		if (data) courses = data as unknown as CourseData[];
	} catch {
		// Empty state
	}

	return { courses };
}

type FilterKey = "ALL" | "IN PROGRESS" | "COMPLETED" | "HAND-CRAFTED";

function getCourseStatus(c: CourseData): string {
	if (!c.lessons || c.lessons.length === 0) return "NOT STARTED";
	const progress = c.lesson_progress ?? [];
	const completedCount = progress.filter((p) => p.status === "completed").length;
	const inProgressCount = progress.filter((p) => p.status === "in_progress").length;
	if (completedCount === c.lessons.length && completedCount > 0) return "COMPLETED";
	if (completedCount > 0 || inProgressCount > 0) return "IN PROGRESS";
	return "NOT STARTED";
}

function getCourseProgress(c: CourseData): number {
	if (!c.lessons || c.lessons.length === 0) return 0;
	const progress = c.lesson_progress ?? [];
	const done = progress.filter((p) => p.status === "completed").length;
	return Math.round((done / c.lessons.length) * 100);
}

export default function LibraryPage({ loaderData }: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();
	const navigate = useNavigate();
	const [filter, setFilter] = useState<FilterKey>("ALL");
	const { courses } = loaderData;

	const filters: FilterKey[] = ["ALL", "IN PROGRESS", "COMPLETED", "HAND-CRAFTED"];

	const filtered = courses.filter((c) => {
		if (filter === "ALL") return true;
		if (filter === "HAND-CRAFTED") return c.source === "manual";
		return getCourseStatus(c) === filter;
	});

	const subtitleText =
		courses.length === 0
			? ""
			: courses.length === 1
				? "one volume."
				: `${courses.length} volumes.`;

	return (
		<div style={{ padding: "0 20px 120px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />

			<div style={{ maxWidth: 1200, margin: "0 auto", paddingTop: 48 }}>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "flex-end",
						justifyContent: "space-between",
						marginBottom: 36,
						flexWrap: "wrap",
						gap: 16,
					}}
				>
					<div>
						<Tracked
							size={10}
							tracking={0.3}
							style={{ color: t.inkGhost, display: "block", marginBottom: 12 }}
						>
							02 / LIBRARY
						</Tracked>
						<h1
							style={{
								fontFamily: "Playfair Display, serif",
								fontSize: "clamp(32px, 7vw, 56px)",
								fontWeight: 500,
								color: t.inkStrong,
								margin: 0,
								letterSpacing: "-0.02em",
								lineHeight: 1,
							}}
						>
							Your Library<span style={{ color: t.accent }}>.</span>
						</h1>
						{subtitleText && (
							<div
								style={{
									fontFamily: "Playfair Display, serif",
									fontSize: 22,
									color: t.inkGhost,
									fontStyle: "italic",
									marginTop: 8,
								}}
							>
								{subtitleText}
							</div>
						)}
					</div>

					{/* Filter tabs */}
					<div style={{ display: "flex", gap: 18 }}>
						{filters.map((f) => (
							<button
								key={f}
								onClick={() => setFilter(f)}
								style={{
									background: "transparent",
									border: "none",
									cursor: "pointer",
									padding: "8px 0",
									borderBottom: `1px solid ${filter === f ? t.accent : "transparent"}`,
								}}
							>
								<Tracked
									size={10}
									tracking={0.3}
									style={{ color: filter === f ? t.ink : t.inkMuted }}
								>
									{f}
								</Tracked>
							</button>
						))}
					</div>
				</div>

				{/* Course grid */}
				{courses.length === 0 ? (
					/* Empty state */
					<div
						style={{
							borderTop: `1px solid ${t.divider}`,
							padding: "80px 0",
							textAlign: "center",
						}}
					>
						<div
							style={{
								fontFamily: "Playfair Display, serif",
								fontSize: 32,
								color: t.inkGhost,
								marginBottom: 16,
							}}
						>
							+
						</div>
						<p
							style={{
								fontFamily: "Playfair Display, serif",
								fontSize: 20,
								color: t.inkMuted,
								fontStyle: "italic",
								marginBottom: 24,
							}}
						>
							your library is empty. ask for your first course below.
						</p>
						<TrackedButton t={t} primary onClick={() => navigate("/learning")}>
							COMPOSE
						</TrackedButton>
					</div>
				) : (
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
							gap: 0,
							borderTop: `1px solid ${t.divider}`,
							borderLeft: `1px solid ${t.divider}`,
						}}
					>
						{filtered.map((c) => {
							const prog = getCourseProgress(c);
							const isManual = c.source === "manual";
							const hours = c.estimated_minutes
								? `${Math.round(c.estimated_minutes / 60)}H`
								: "";
							const status = getCourseStatus(c);

							return (
								<div
									key={c.id}
									onClick={() => navigate(`/learning/courses/${c.slug}`)}
									style={{
										borderRight: `1px solid ${t.divider}`,
										borderBottom: `1px solid ${t.divider}`,
										padding: "28px 26px 24px",
										cursor: "pointer",
										transition: "background .3s",
										position: "relative",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = t.bgCard;
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
									}}
								>
									{/* Monogram + badge */}
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "flex-start",
											marginBottom: 36,
										}}
									>
										<div
											style={{
												width: 56,
												height: 72,
												border: `1px solid ${t.divider}`,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											<span
												style={{
													fontFamily: "Playfair Display, serif",
													fontSize: 36,
													color: t.inkStrong,
													fontWeight: 500,
												}}
											>
												{c.cover_monogram || c.title[0]}
											</span>
										</div>
										{isManual && (
											<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost }}>
												✓ HAND-CRAFTED
											</Tracked>
										)}
									</div>

									{/* Title */}
									<div
										style={{
											fontFamily: "Playfair Display, serif",
											fontSize: 22,
											color: t.inkStrong,
											lineHeight: 1.15,
											marginBottom: 8,
										}}
									>
										{c.title}
									</div>

									{/* Subtitle */}
									{c.subtitle && (
										<div
											style={{
												fontFamily: "Playfair Display, serif",
												fontSize: 14,
												color: t.inkMuted,
												fontStyle: "italic",
												marginBottom: 22,
												lineHeight: 1.4,
											}}
										>
											{c.subtitle}
										</div>
									)}

									{/* Progress */}
									<ProgressBar value={prog} t={t} />

									{/* Meta */}
									<div style={{ marginTop: 14 }}>
										<Tracked size={9} tracking={0.22} style={{ color: t.inkGhost }}>
											{isManual ? "HAND-CRAFTED" : "AI-GENERATED"}
											{hours && ` · ${hours}`}
											{` · ${status}`}
										</Tracked>
									</div>
								</div>
							);
						})}

						{/* Empty slot — "ask for one" */}
						<div
							style={{
								borderRight: `1px solid ${t.divider}`,
								borderBottom: `1px solid ${t.divider}`,
								padding: "28px 26px 24px",
								display: "flex",
								flexDirection: "column",
								justifyContent: "center",
								alignItems: "flex-start",
								gap: 10,
							}}
						>
							<span
								style={{
									fontSize: 32,
									color: t.inkGhost,
									fontFamily: "Playfair Display, serif",
								}}
							>
								+
							</span>
							<div
								style={{
									fontFamily: "Playfair Display, serif",
									fontSize: 19,
									color: t.inkMuted,
									fontStyle: "italic",
								}}
							>
								ask for your next one.
							</div>
							<TrackedButton
								t={t}
								primary
								onClick={() => navigate("/learning")}
							>
								COMPOSE
							</TrackedButton>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
