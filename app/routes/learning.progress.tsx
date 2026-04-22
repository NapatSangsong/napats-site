/**
 * Progress dashboard — course stats, active/completed courses, spaced repetition reviews.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/learning.progress";
import { useTheme } from "./learning";
import { createServiceClient } from "~/lib/supabase.server";
import { TopBar } from "~/components/learning/TopBar";
import {
	Tracked,
	FilmDot,
	Rule,
	TrackedButton,
	ProgressBar,
	Stat,
} from "~/components/learning/primitives";

export function meta() {
	return [{ title: "Napat · Learning · Progress" }];
}

// ── Types ───────────────────────────────────────────────────

interface LessonRow {
	id: string;
	order_index: number;
	title: string;
	status: string;
}

interface ProgressRow {
	lesson_id: string;
	status: string;
	scroll_percent: number;
	completed_at: string | null;
}

interface CourseRow {
	id: string;
	slug: string;
	title: string;
	subtitle: string | null;
	cover_monogram: string | null;
	source: string;
	estimated_minutes: number | null;
	lessons: LessonRow[];
	lesson_progress: ProgressRow[];
}

interface ReviewItem {
	id: string;
	lesson_id: string;
	course_id: string;
	interval_days: number;
	due_at: string;
	courses: { title: string; slug: string } | null;
	lessons: { title: string } | null;
}

// ── Loader ──────────────────────────────────────────────────

export async function loader({ context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	let courses: CourseRow[] = [];

	try {
		const supabase = createServiceClient(env);
		const { data } = await supabase
			.from("courses")
			.select(`
				id, slug, title, subtitle, cover_monogram, source, estimated_minutes,
				lessons(id, order_index, title, status),
				lesson_progress:lessons(lesson_progress(lesson_id, status, scroll_percent, completed_at))
			`)
			.eq("archived", false)
			.order("updated_at", { ascending: false });

		if (data) {
			courses = data as unknown as CourseRow[];
		}
	} catch {
		// Supabase may not be set up yet
	}

	return { courses };
}

// ── Helpers ─────────────────────────────────────────────────

function flattenProgress(c: CourseRow): ProgressRow[] {
	// lesson_progress comes from a nested join: lessons -> lesson_progress
	// Each entry in c.lesson_progress is a lesson object with a nested lesson_progress array
	const raw = c.lesson_progress as unknown;
	if (!Array.isArray(raw)) return [];
	const rows: ProgressRow[] = [];
	for (const item of raw) {
		if (item && typeof item === "object" && "lesson_progress" in item) {
			const nested = (item as { lesson_progress: ProgressRow[] }).lesson_progress;
			if (Array.isArray(nested)) rows.push(...nested);
		} else if (item && typeof item === "object" && "lesson_id" in item) {
			// Already flat
			rows.push(item as ProgressRow);
		}
	}
	return rows;
}

function computeCourseStats(courses: CourseRow[]) {
	let totalLessons = 0;
	let completedLessons = 0;
	let totalMinutes = 0;

	for (const c of courses) {
		const lessons = c.lessons?.length ?? 0;
		totalLessons += lessons;
		const progressRows = flattenProgress(c);
		const completed = progressRows.filter(
			(p) => p.status === "completed",
		).length;
		const inProgress = progressRows.filter(
			(p) => p.status === "in_progress",
		).length;
		completedLessons += completed;
		const perLesson = (c.estimated_minutes && lessons > 0)
			? c.estimated_minutes / lessons
			: 15;
		totalMinutes += Math.round(completed * perLesson + inProgress * 7);
	}

	return { totalLessons, completedLessons, totalMinutes };
}

function courseProgress(c: CourseRow) {
	const total = c.lessons?.length ?? 0;
	const progressRows = flattenProgress(c);
	const completed = progressRows.filter(
		(p) => p.status === "completed",
	).length;
	return total > 0 ? Math.round((completed / total) * 100) : 0;
}

function formatHours(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRelativeDate(iso: string): string {
	const date = new Date(iso);
	const now = new Date();
	const diffMs = date.getTime() - now.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays <= 0) return "today";
	if (diffDays === 1) return "tomorrow";
	if (diffDays < 7) return `in ${diffDays} days`;
	if (diffDays < 30) {
		const weeks = Math.round(diffDays / 7);
		return `in ${weeks}w`;
	}
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Component ───────────────────────────────────────────────

export default function ProgressPage({ loaderData }: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();
	const navigate = useNavigate();
	const { courses } = loaderData;

	// Client-side review schedule fetch
	const [dueReviews, setDueReviews] = useState<ReviewItem[]>([]);
	const [upcomingReviews, setUpcomingReviews] = useState<ReviewItem[]>([]);
	const [reviewsLoaded, setReviewsLoaded] = useState(false);

	useEffect(() => {
		fetch("/learning/api/review-schedule")
			.then((r) => r.json())
			.then((data: { due: ReviewItem[]; upcoming: ReviewItem[] }) => {
				setDueReviews(data.due || []);
				setUpcomingReviews(data.upcoming || []);
				setReviewsLoaded(true);
			})
			.catch(() => setReviewsLoaded(true));
	}, []);

	const handleReviewDone = useCallback(async (reviewId: string) => {
		try {
			await fetch("/learning/api/review-schedule", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reviewId }),
			});
			setDueReviews((prev) => prev.filter((r) => r.id !== reviewId));
		} catch {
			// silent
		}
	}, []);

	const stats = computeCourseStats(courses);
	const activeCourses = courses.filter(
		(c) => courseProgress(c) > 0 && courseProgress(c) < 100,
	);
	const completedCourses = courses.filter((c) => courseProgress(c) === 100);

	return (
		<div style={{ padding: "0 20px 120px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />

			<div style={{ maxWidth: 920, margin: "0 auto", paddingTop: "10vh" }}>
				{/* Header */}
				<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
					<Rule width={56} color={t.inkGhost} />
					<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
						03 / PROGRESS
					</Tracked>
				</div>

				<h1
					style={{
						fontFamily: "Playfair Display, serif",
						fontSize: "clamp(36px, 9vw, 72px)",
						lineHeight: 0.95,
						fontWeight: 500,
						color: t.inkStrong,
						letterSpacing: "-0.02em",
						margin: 0,
					}}
				>
					Progress<span style={{ color: t.accent }}>.</span>
				</h1>

				{/* ── Overall Stats ────────────────────────────────── */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
						gap: 0,
						marginTop: 56,
						borderTop: `1px solid ${t.divider}`,
						borderBottom: `1px solid ${t.divider}`,
					}}
				>
					{[
						{ value: courses.length, label: "COURSES" },
						{ value: stats.completedLessons, label: "LESSONS COMPLETED" },
						{ value: formatHours(stats.totalMinutes), label: "TIME LEARNED" },
					].map((s, i) => (
						<div
							key={s.label}
							style={{
								padding: "32px 24px",
								borderRight: i < 2 ? `1px solid ${t.divider}` : "none",
							}}
						>
							<Stat value={s.value} label={s.label} t={t} size={44} />
						</div>
					))}
				</div>

				{/* ── Reviews Due ──────────────────────────────────── */}
				{reviewsLoaded && dueReviews.length > 0 && (
					<div style={{ marginTop: 64 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
							<FilmDot size={6} breathe />
							<Tracked size={10} tracking={0.3} style={{ color: t.accent }}>
								{dueReviews.length} REVIEW{dueReviews.length > 1 ? "S" : ""} DUE
							</Tracked>
						</div>

						<div style={{ borderTop: `1px solid ${t.divider}` }}>
							{dueReviews.map((r) => (
								<div
									key={r.id}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "18px 0",
										borderBottom: `1px solid ${t.divider}`,
									}}
								>
									<div style={{ flex: 1 }}>
										<div
											style={{
												fontFamily: "Playfair Display, serif",
												fontSize: 17,
												color: t.inkStrong,
												lineHeight: 1.3,
											}}
										>
											{r.lessons?.title ?? "Lesson"}
										</div>
										<Tracked size={9} tracking={0.2} style={{ color: t.inkGhost, marginTop: 4, display: "block" }}>
											{r.courses?.title ?? "Course"} · INTERVAL {r.interval_days}D
										</Tracked>
									</div>
									<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
										<TrackedButton
											t={t}
											primary
											onClick={() =>
												navigate(
													`/learning/courses/${r.courses?.slug ?? ""}/lessons/${r.lesson_id}`,
												)
											}
										>
											REVIEW NOW
										</TrackedButton>
										<TrackedButton t={t} onClick={() => handleReviewDone(r.id)}>
											DONE
										</TrackedButton>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* ── Upcoming Reviews ─────────────────────────────── */}
				{reviewsLoaded && upcomingReviews.length > 0 && (
					<div style={{ marginTop: dueReviews.length > 0 ? 48 : 64 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
							<Rule width={40} color={t.inkGhost} />
							<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
								UPCOMING REVIEWS
							</Tracked>
						</div>

						<div style={{ borderTop: `1px solid ${t.divider}` }}>
							{upcomingReviews.map((r) => (
								<div
									key={r.id}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "14px 0",
										borderBottom: `1px solid ${t.divider}`,
									}}
								>
									<div style={{ flex: 1 }}>
										<span
											style={{
												fontFamily: "Playfair Display, serif",
												fontSize: 15,
												color: t.ink,
											}}
										>
											{r.lessons?.title ?? "Lesson"}
										</span>
										<Tracked size={9} tracking={0.2} style={{ color: t.inkGhost, marginLeft: 12 }}>
											{r.courses?.title ?? ""}
										</Tracked>
									</div>
									<Tracked size={9} tracking={0.2} style={{ color: t.inkMuted, flexShrink: 0 }}>
										{formatRelativeDate(r.due_at)}
									</Tracked>
								</div>
							))}
						</div>
					</div>
				)}

				{/* ── Active Courses ──────────────────────────────── */}
				{activeCourses.length > 0 && (
					<div style={{ marginTop: 64 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
							<Rule width={40} color={t.inkGhost} />
							<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
								IN PROGRESS · {activeCourses.length}
							</Tracked>
						</div>

						<div style={{ borderTop: `1px solid ${t.divider}` }}>
							{activeCourses.map((c) => {
								const prog = courseProgress(c);
								const total = c.lessons?.length ?? 0;
								const done = c.lesson_progress?.filter(
									(p) => p.status === "completed",
								).length ?? 0;

								return (
									<div
										key={c.id}
										onClick={() => navigate(`/learning/courses/${c.slug}`)}
										style={{
											padding: "24px 0",
											borderBottom: `1px solid ${t.divider}`,
											cursor: "pointer",
											transition: "opacity .25s",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.opacity = "0.8";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.opacity = "1";
										}}
									>
										<div
											style={{
												display: "flex",
												alignItems: "baseline",
												justifyContent: "space-between",
												marginBottom: 10,
											}}
										>
											<div style={{ display: "flex", alignItems: "baseline", gap: 14, flex: 1 }}>
												<span
													style={{
														fontFamily: "Playfair Display, serif",
														fontSize: 20,
														color: t.inkGhost,
														fontWeight: 500,
													}}
												>
													{c.cover_monogram || c.title[0]}
												</span>
												<span
													style={{
														fontFamily: "Playfair Display, serif",
														fontSize: 20,
														color: t.inkStrong,
														fontWeight: 500,
													}}
												>
													{c.title}
												</span>
											</div>
											<Tracked size={9} tracking={0.22} style={{ color: t.inkGhost, flexShrink: 0 }}>
												{done}/{total} LESSONS · {prog}%
											</Tracked>
										</div>

										{c.subtitle && (
											<div
												style={{
													fontFamily: "Playfair Display, serif",
													fontSize: 13,
													color: t.inkMuted,
													fontStyle: "italic",
													marginBottom: 12,
												}}
											>
												{c.subtitle}
											</div>
										)}

										<ProgressBar value={prog} t={t} />
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* ── Completed Courses ────────────────────────────── */}
				{completedCourses.length > 0 && (
					<div style={{ marginTop: 64 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
							<Rule width={40} color={t.inkGhost} />
							<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
								COMPLETED · {completedCourses.length}
							</Tracked>
						</div>

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
								gap: 0,
								borderTop: `1px solid ${t.divider}`,
							}}
						>
							{completedCourses.map((c, i) => {
								const total = c.lessons?.length ?? 0;

								return (
									<div
										key={c.id}
										onClick={() => navigate(`/learning/courses/${c.slug}`)}
										style={{
											padding: "28px 24px 24px",
											borderRight:
												i < completedCourses.length - 1 && (i + 1) % 3 !== 0
													? `1px solid ${t.divider}`
													: "none",
											borderBottom: `1px solid ${t.divider}`,
											cursor: "pointer",
											transition: "background .3s",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = t.bgCard;
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = "transparent";
										}}
									>
										<div
											style={{
												display: "flex",
												alignItems: "baseline",
												justifyContent: "space-between",
												marginBottom: 12,
											}}
										>
											<span
												style={{
													fontFamily: "Playfair Display, serif",
													fontSize: 22,
													color: t.inkGhost,
													fontWeight: 500,
												}}
											>
												{c.cover_monogram || c.title[0]}
											</span>
											<Tracked size={9} tracking={0.22} style={{ color: t.inkGhost }}>
												{total} LESSONS
											</Tracked>
										</div>
										<div
											style={{
												fontFamily: "Playfair Display, serif",
												fontSize: 18,
												color: t.inkStrong,
												lineHeight: 1.2,
												marginBottom: 6,
											}}
										>
											{c.title}
										</div>
										{c.subtitle && (
											<div
												style={{
													fontSize: 13,
													color: t.inkMuted,
													fontStyle: "italic",
													fontFamily: "Playfair Display, serif",
												}}
											>
												{c.subtitle}
											</div>
										)}
										<ProgressBar value={100} t={t} />
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* ── Empty state ──────────────────────────────────── */}
				{courses.length === 0 && (
					<div style={{ marginTop: 80, textAlign: "center" }}>
						<p
							style={{
								fontFamily: "Playfair Display, serif",
								fontSize: 22,
								color: t.inkGhost,
								fontStyle: "italic",
							}}
						>
							No courses yet. Start learning to see your progress here.
						</p>
						<div style={{ marginTop: 24 }}>
							<TrackedButton t={t} primary onClick={() => navigate("/learning")}>
								GO TO COMMAND CENTER
							</TrackedButton>
						</div>
					</div>
				)}

				{/* ── Footer ──────────────────────────────────────── */}
				<div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 44 }}>
					<FilmDot size={5} />
					<Tracked size={9} tracking={0.3} style={{ color: t.inkGhost }}>
						{courses.length} COURSES · {stats.completedLessons}/{stats.totalLessons} LESSONS
					</Tracked>
				</div>
			</div>
		</div>
	);
}
