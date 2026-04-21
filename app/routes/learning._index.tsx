/**
 * Command Center — the home of /learning.
 * Variation A from the design: centered hero with compose input,
 * action chips, continue-learning strip, and footer stats.
 */
import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/learning._index";
import { useTheme } from "./learning";
import { createServiceClient } from "~/lib/supabase.server";
import { TopBar } from "~/components/learning/TopBar";
import {
	Tracked,
	FilmDot,
	Rule,
	Chip,
	TrackedButton,
	UnderlineInput,
	ProgressBar,
} from "~/components/learning/primitives";

export function meta() {
	return [{ title: "Napat · Learning" }];
}

interface CourseRow {
	id: string;
	slug: string;
	title: string;
	subtitle: string | null;
	source: string;
	cover_monogram: string | null;
	lessons: { id: string; order_index: number; title: string; status: string }[];
	lesson_progress: { lesson_id: string; status: string; scroll_percent: number }[];
}

export async function loader({ context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	let courses: CourseRow[] = [];
	let totalLessons = 0;

	try {
		const supabase = createServiceClient(env);

		// Get recent courses with lesson count and progress
		const { data } = await supabase
			.from("courses")
			.select(`
				id, slug, title, subtitle, source, cover_monogram,
				lessons(id, order_index, title, status),
				lesson_progress:lessons(lesson_progress(lesson_id, status, scroll_percent))
			`)
			.eq("archived", false)
			.order("updated_at", { ascending: false })
			.limit(6);

		if (data) {
			courses = data as unknown as CourseRow[];
			for (const c of courses) {
				totalLessons += c.lessons?.length ?? 0;
			}
		}
	} catch {
		// Supabase may not be set up yet — render empty state
	}

	return { courses, totalLessons };
}

export default function CommandCenter({ loaderData }: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();
	const navigate = useNavigate();
	const [prompt, setPrompt] = useState("");
	const [selectedModel, setSelectedModel] = useState("AUTO");
	const [composing, setComposing] = useState(false);
	const [outline, setOutline] = useState("");
	const [composeError, setComposeError] = useState("");
	const [approving, setApproving] = useState(false);
	const [refineInput, setRefineInput] = useState("");
	const [refining, setRefining] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const { courses, totalLessons } = loaderData;

	const MODEL_MAP: Record<string, string | undefined> = {
		OPUS: "claude-opus-4-7",
		SONNET: "claude-sonnet-4-6",
		HAIKU: "claude-haiku-4-5-20251001",
		AUTO: undefined,
	};

	const handleCompose = useCallback(async () => {
		if (!prompt.trim() || composing) return;
		setComposing(true);
		setOutline("");
		setComposeError("");

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const res = await fetch("/learning/api/ai/plan-course", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: prompt.trim(),
					model: MODEL_MAP[selectedModel],
				}),
				signal: controller.signal,
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: "request failed" }));
				setComposeError(err.message || `Error ${res.status}`);
				setComposing(false);
				return;
			}

			const reader = res.body?.getReader();
			if (!reader) {
				setComposeError("No response stream");
				setComposing(false);
				return;
			}

			const decoder = new TextDecoder();
			let buffer = "";
			let currentEvent = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// SSE messages are separated by double newlines
				const messages = buffer.split("\n\n");
				buffer = messages.pop() || "";

				for (const msg of messages) {
					const lines = msg.split("\n");
					let eventType = "";
					const dataLines: string[] = [];

					for (const line of lines) {
						if (line.startsWith("event: ")) {
							eventType = line.slice(7);
						} else if (line.startsWith("data: ")) {
							dataLines.push(line.slice(6));
						}
					}
					const data = dataLines.join("\n");

					if (eventType === "error") {
						try {
							const parsed = JSON.parse(data);
							setComposeError(parsed.message || data);
						} catch {
							setComposeError(data);
						}
						continue;
					}

					if (eventType === "end") continue;

					if (data) {
						setOutline((prev) => prev + data);
					}
				}
			}
		} catch (err) {
			if ((err as Error).name !== "AbortError") {
				setComposeError((err as Error).message || "Connection failed");
			}
		} finally {
			setComposing(false);
			abortRef.current = null;
		}
	}, [prompt, selectedModel, composing]);

	const handleApprove = useCallback(async () => {
		if (!outline.trim() || approving) return;
		setApproving(true);
		setComposeError("");

		try {
			// Parse the outline as JSON — the AI returns a CourseDraft JSON object
			let draft;
			// Extract JSON from markdown code block if wrapped, or use raw
			const jsonMatch = outline.match(/```(?:json)?\s*([\s\S]*?)```/);
			let jsonStr = jsonMatch ? jsonMatch[1].trim() : outline.trim();
			// Also try extracting the first { ... } block if parsing fails
			try {
				draft = JSON.parse(jsonStr);
			} catch {
				const braceMatch = outline.match(/\{[\s\S]*\}/);
				if (braceMatch) {
					try {
						draft = JSON.parse(braceMatch[0]);
					} catch {
						setComposeError("Could not parse course outline as JSON. Try composing again.");
						setApproving(false);
						return;
					}
				} else {
					setComposeError("Could not parse course outline as JSON. Try composing again.");
					setApproving(false);
					return;
				}
			}

			const res = await fetch("/learning/api/courses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(draft),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: "failed to create course" }));
				setComposeError(err.message || `Error ${res.status}`);
				setApproving(false);
				return;
			}

			const { course } = await res.json();
			navigate(`/learning/courses/${course.slug}`);
		} catch (err) {
			setComposeError((err as Error).message || "Failed to create course");
		} finally {
			setApproving(false);
		}
	}, [outline, approving, navigate]);

	const handleRefine = useCallback(async () => {
		if (!refineInput.trim() || !outline.trim() || refining) return;
		setRefining(true);
		setComposeError("");

		const controller = new AbortController();
		abortRef.current = controller;

		const refinedPrompt = `Here is the current course outline:\n\n${outline}\n\nThe user wants the following changes:\n${refineInput.trim()}\n\nPlease return the updated course outline as a single JSON object with the same schema. Return ONLY the JSON object, no commentary.`;

		try {
			const res = await fetch("/learning/api/ai/plan-course", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: refinedPrompt,
					model: MODEL_MAP[selectedModel],
				}),
				signal: controller.signal,
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: "request failed" }));
				setComposeError(err.message || `Error ${res.status}`);
				setRefining(false);
				return;
			}

			const reader = res.body?.getReader();
			if (!reader) {
				setComposeError("No response stream");
				setRefining(false);
				return;
			}

			setOutline("");
			setRefineInput("");
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const messages = buffer.split("\n\n");
				buffer = messages.pop() || "";

				for (const msg of messages) {
					const lines = msg.split("\n");
					let eventType = "";
					const dataLines: string[] = [];

					for (const line of lines) {
						if (line.startsWith("event: ")) {
							eventType = line.slice(7);
						} else if (line.startsWith("data: ")) {
							dataLines.push(line.slice(6));
						}
					}
					const data = dataLines.join("\n");

					if (eventType === "error") {
						try {
							const parsed = JSON.parse(data);
							setComposeError(parsed.message || data);
						} catch {
							setComposeError(data);
						}
						continue;
					}
					if (eventType === "end") continue;
					if (data) {
						setOutline((prev) => prev + data);
					}
				}
			}
		} catch (err) {
			if ((err as Error).name !== "AbortError") {
				setComposeError((err as Error).message || "Connection failed");
			}
		} finally {
			setRefining(false);
			abortRef.current = null;
		}
	}, [refineInput, outline, selectedModel, refining]);

	const models = ["OPUS", "SONNET", "HAIKU", "AUTO"] as const;

	// Build "continue learning" cards from real data, or show starters
	const continueCourses = courses.slice(0, 3);

	const starters = [
		"Teach me CSS Grid, from zero to layout mastery.",
		"Why does Rust hate me? Explain ownership with a cooking analogy.",
		"A week of monochrome darkroom — chemistry, paper, patience.",
		"Minsu, Bol4, Yerin Baek — what makes K-ballad feel like rain?",
	];

	const hasCourses = courses.length > 0;

	return (
		<div style={{ padding: "0 48px 120px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />

			<div style={{ maxWidth: 920, margin: "0 auto", paddingTop: "14vh" }}>
				{/* Label */}
				<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
					<Rule width={56} color={t.inkGhost} />
					<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
						WHAT DO YOU WANT TO LEARN TODAY
					</Tracked>
				</div>

				{/* Title */}
				<h1
					style={{
						fontFamily: "Playfair Display, serif",
						fontSize: 88,
						lineHeight: 0.95,
						fontWeight: 500,
						color: t.inkStrong,
						letterSpacing: "-0.02em",
						margin: 0,
					}}
				>
					Learning<span style={{ color: t.accent }}>.</span>
				</h1>
				<span
					style={{
						display: "block",
						fontFamily: "Playfair Display, serif",
						fontSize: 48,
						lineHeight: 1.1,
						fontWeight: 400,
						color: t.inkGhost,
						marginTop: 4,
						letterSpacing: "-0.015em",
					}}
				>
					a private library.
				</span>

				{/* Compose input */}
				<div style={{ marginTop: 48, position: "relative" }}>
					<UnderlineInput
						t={t}
						multiline
						rows={2}
						value={prompt}
						onChange={setPrompt}
						placeholder="Teach me… / Build a course on…"
					/>
					{/* Model picker overlay */}
					<div
						style={{
							position: "absolute",
							right: 0,
							top: 18,
							display: "flex",
							alignItems: "center",
							gap: 14,
						}}
					>
						<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost }}>
							MODEL · {selectedModel}
						</Tracked>
						<svg
							width="9"
							height="9"
							viewBox="0 0 9 9"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.2"
							style={{ color: t.inkGhost }}
						>
							<path d="M1.5 3.5L4.5 6.5L7.5 3.5" />
						</svg>
					</div>
				</div>

				{/* Model chips + compose button */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginTop: 18,
					}}
				>
					<div style={{ display: "flex", gap: 8 }}>
						{models.map((m) => (
							<Chip
								key={m}
								t={t}
								active={m === selectedModel}
								onClick={() => setSelectedModel(m)}
							>
								{m}
							</Chip>
						))}
					</div>
					{composing ? (
						<TrackedButton t={t} onClick={() => abortRef.current?.abort()}>
							STOP
						</TrackedButton>
					) : (
						<TrackedButton
							t={t}
							primary
							disabled={!prompt.trim()}
							onClick={handleCompose}
						>
							COMPOSE
						</TrackedButton>
					)}
				</div>

				{/* Compose error */}
				{composeError && (
					<div style={{ marginTop: 16, color: t.accent, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
						{composeError}
					</div>
				)}

				{/* Outline result */}
				{outline && (
					<div style={{ marginTop: 32 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
							<Rule width={40} color={t.inkGhost} />
							<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
								COURSE OUTLINE
							</Tracked>
							{composing && <FilmDot size={5} breathe />}
						</div>
						<pre
							style={{
								fontFamily: "Playfair Display, serif",
								fontSize: 15,
								lineHeight: 1.7,
								color: t.ink,
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								margin: 0,
								padding: "24px 0",
								borderTop: `1px solid ${t.divider}`,
								borderBottom: `1px solid ${t.divider}`,
							}}
						>
							{outline}
						</pre>
						{!composing && !refining && (
							<>
								{/* Refine input */}
								<div style={{ marginTop: 20 }}>
									<div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
										<div style={{ flex: 1 }}>
											<UnderlineInput
												t={t}
												value={refineInput}
												onChange={setRefineInput}
												placeholder="Add more lessons on…  /  Make it more advanced…  /  Change the title to…"
											/>
										</div>
										<TrackedButton
											t={t}
											disabled={!refineInput.trim()}
											onClick={handleRefine}
										>
											REFINE
										</TrackedButton>
									</div>
								</div>

								{/* Action buttons */}
								<div style={{ display: "flex", gap: 12, marginTop: 18, justifyContent: "flex-end" }}>
									<TrackedButton
										t={t}
										onClick={() => { setOutline(""); setComposeError(""); setRefineInput(""); }}
									>
										DISCARD
									</TrackedButton>
									<TrackedButton
										t={t}
										primary
										disabled={approving}
										onClick={handleApprove}
									>
										{approving ? "CREATING…" : "APPROVE & CREATE"}
									</TrackedButton>
								</div>
							</>
						)}
						{refining && (
							<div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
								<FilmDot size={5} breathe />
								<Tracked size={10} tracking={0.25} style={{ color: t.inkGhost }}>
									REFINING OUTLINE…
								</Tracked>
								<TrackedButton t={t} onClick={() => abortRef.current?.abort()}>
									STOP
								</TrackedButton>
							</div>
						)}
					</div>
				)}

				{/* Continue learning strip OR starters */}
				{hasCourses ? (
					<div style={{ marginTop: 100 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
							<Rule width={40} color={t.inkGhost} />
							<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
								CONTINUE LEARNING
							</Tracked>
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: `repeat(${Math.min(continueCourses.length, 3)}, 1fr)`,
								gap: 0,
								borderTop: `1px solid ${t.divider}`,
							}}
						>
							{continueCourses.map((c, i) => {
								const lessonCount = c.lessons?.length ?? 0;
								const completedCount = c.lesson_progress?.filter(
									(p: { status: string }) => p.status === "completed",
								).length ?? 0;
								const prog = lessonCount > 0 ? Math.round((completedCount / lessonCount) * 100) : 0;
								const sourceLabel = c.source === "manual" ? "HAND-CRAFTED" : "AI-GENERATED";

								return (
									<div
										key={c.id}
										onClick={() => navigate(`/learning/courses/${c.slug}`)}
										style={{
											padding: "28px 24px 24px",
											borderRight: i < continueCourses.length - 1 ? `1px solid ${t.divider}` : "none",
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
												{sourceLabel} · {prog}%
											</Tracked>
										</div>
										<div
											style={{
												fontFamily: "Playfair Display, serif",
												fontSize: 22,
												color: t.inkStrong,
												lineHeight: 1.15,
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
													marginBottom: 20,
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
				) : (
					/* Starters from the oracle */
					<div style={{ marginTop: 56 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
							<Rule width={40} color={t.inkGhost} />
							<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
								STARTERS FROM THE ORACLE
							</Tracked>
						</div>
						<div>
							{starters.map((s, i) => (
								<div
									key={i}
									onClick={() => setPrompt(s)}
									style={{
										padding: "18px 0",
										borderTop: `1px solid ${t.divider}`,
										display: "flex",
										alignItems: "center",
										gap: 16,
										cursor: "pointer",
									}}
								>
									<Tracked size={9} style={{ color: t.inkGhost, width: 20 }}>
										{String(i + 1).padStart(2, "0")}
									</Tracked>
									<span
										style={{
											fontFamily: "Playfair Display, serif",
											fontSize: 18,
											color: t.ink,
											fontStyle: "italic",
											flex: 1,
										}}
									>
										"{s}"
									</span>
									<span style={{ color: t.inkGhost }}>→</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Footer stats */}
				<div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 44 }}>
					<FilmDot size={5} />
					<Tracked size={9} tracking={0.3} style={{ color: t.inkGhost }}>
						{courses.length} COURSES · {totalLessons} LESSONS
					</Tracked>
				</div>
			</div>
		</div>
	);
}
