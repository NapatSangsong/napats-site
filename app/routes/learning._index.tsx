/**
 * Command Center — the home of /learning.
 * Smart, conversational course composer with visual preview.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
	let reviewsDue = 0;

	try {
		const supabase = createServiceClient(env);
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

		// Count reviews due
		try {
			const { count } = await supabase
				.from("review_schedule")
				.select("id", { count: "exact", head: true })
				.is("completed_at", null)
				.lte("due_at", new Date().toISOString());
			reviewsDue = count ?? 0;
		} catch {
			// review_schedule table may not exist yet
		}
	} catch {
		// Supabase may not be set up yet
	}

	return { courses, totalLessons, reviewsDue };
}

// ── Types ───────────────────────────────────────────────────
interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

interface CourseDraft {
	title: string;
	subtitle?: string | null;
	description?: string | null;
	language: string;
	difficulty: "beginner" | "intermediate" | "advanced";
	estimated_minutes?: number | null;
	tags: string[];
	cover_monogram?: string | null;
	lessons: { title: string; summary?: string | null; outcomes: string[] }[];
}

// ── Helpers ─────────────────────────────────────────────────
const MODEL_MAP: Record<string, string | undefined> = {
	OPUS: "claude-opus-4-7",
	SONNET: "claude-sonnet-4-6",
	HAIKU: "claude-haiku-4-5-20251001",
	AUTO: undefined,
};

/** Extract the last ```json ... ``` block and parse it */
function extractDraft(text: string): CourseDraft | null {
	const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
	if (matches.length > 0) {
		try {
			return JSON.parse(matches[matches.length - 1][1].trim());
		} catch {
			return null;
		}
	}
	const braceMatch = text.match(/\{[\s\S]*\}/);
	if (braceMatch) {
		try {
			return JSON.parse(braceMatch[0]);
		} catch {
			return null;
		}
	}
	return null;
}

/** Extract conversational text (strip JSON blocks) */
function extractConversation(text: string): string {
	return text.replace(/```json\s*[\s\S]*?```/g, "").trim();
}

/** Extract [suggestion: ...] tags from text */
function extractSuggestions(text: string): string[] {
	const matches = [...text.matchAll(/\[suggestion:\s*([^\]]+)\]/g)];
	return matches.map((m) => m[1].trim());
}

/** Strip [suggestion: ...] tags from display text */
function stripSuggestions(text: string): string {
	return text.replace(/\[suggestion:\s*[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Stream SSE from plan-course API */
async function streamPlanCourse(
	body: { prompt: string; model?: string; messages?: ChatMessage[] },
	onDelta: (text: string) => void,
	signal?: AbortSignal,
): Promise<string> {
	const res = await fetch("/learning/api/ai/plan-course", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({ message: "request failed" }));
		throw new Error(err.message || `Error ${res.status}`);
	}

	const reader = res.body?.getReader();
	if (!reader) throw new Error("No response stream");

	const decoder = new TextDecoder();
	let buffer = "";
	let fullText = "";

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
				if (line.startsWith("event: ")) eventType = line.slice(7);
				else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
			}
			const data = dataLines.join("\n");

			if (eventType === "error") {
				try {
					const parsed = JSON.parse(data);
					throw new Error(parsed.message || data);
				} catch (e) {
					if (e instanceof Error && e.message !== data) throw e;
					throw new Error(data);
				}
			}
			if (eventType === "end") continue;
			if (data) {
				fullText += data;
				onDelta(data);
			}
		}
	}

	return fullText;
}

const DIFFICULTY_LABELS: Record<string, string> = {
	beginner: "Beginner",
	intermediate: "Intermediate",
	advanced: "Advanced",
};

// ── Course Preview Card ─────────────────────────────────────
function CoursePreviewCard({ draft, t }: { draft: CourseDraft; t: Record<string, string> }) {
	const hours = draft.estimated_minutes ? Math.round(draft.estimated_minutes / 60) : null;
	const mins = draft.estimated_minutes ? draft.estimated_minutes % 60 : null;
	const timeLabel = hours && hours > 0
		? mins ? `${hours}h ${mins}m` : `${hours}h`
		: draft.estimated_minutes ? `${draft.estimated_minutes}m` : null;

	return (
		<div
			style={{
				border: `1px solid ${t.divider}`,
				padding: "28px 28px 24px",
				marginTop: 20,
				marginBottom: 8,
			}}
		>
			{/* Header */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
				<div style={{ flex: 1 }}>
					{/* Monogram */}
					{draft.cover_monogram && (
						<span
							style={{
								fontFamily: "Playfair Display, serif",
								fontSize: 32,
								fontWeight: 500,
								color: t.inkGhost,
								display: "block",
								marginBottom: 8,
							}}
						>
							{draft.cover_monogram}
						</span>
					)}
					<div
						style={{
							fontFamily: "Playfair Display, serif",
							fontSize: 24,
							fontWeight: 500,
							color: t.inkStrong,
							lineHeight: 1.2,
						}}
					>
						{draft.title}
					</div>
					{draft.subtitle && (
						<div
							style={{
								fontFamily: "Playfair Display, serif",
								fontSize: 15,
								color: t.inkMuted,
								fontStyle: "italic",
								marginTop: 4,
							}}
						>
							{draft.subtitle}
						</div>
					)}
				</div>
				{/* Meta badges */}
				<div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 16 }}>
					{draft.difficulty && (
						<span
							style={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: 9,
								textTransform: "uppercase",
								letterSpacing: "0.15em",
								padding: "4px 8px",
								border: `1px solid ${t.divider}`,
								color: t.inkMuted,
							}}
						>
							{DIFFICULTY_LABELS[draft.difficulty] || draft.difficulty}
						</span>
					)}
					{timeLabel && (
						<span
							style={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: 9,
								textTransform: "uppercase",
								letterSpacing: "0.15em",
								padding: "4px 8px",
								border: `1px solid ${t.divider}`,
								color: t.inkMuted,
							}}
						>
							{timeLabel}
						</span>
					)}
				</div>
			</div>

			{draft.description && (
				<div
					style={{
						fontSize: 14,
						lineHeight: 1.6,
						color: t.inkMuted,
						marginBottom: 20,
					}}
				>
					{draft.description}
				</div>
			)}

			{/* Lessons list */}
			<div>
				<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost, marginBottom: 12, display: "block" }}>
					{draft.lessons.length} LESSONS
				</Tracked>
				{draft.lessons.map((lesson, i) => (
					<div
						key={i}
						style={{
							display: "flex",
							gap: 14,
							padding: "10px 0",
							borderTop: i === 0 ? `1px solid ${t.divider}` : "none",
							borderBottom: `1px solid ${t.divider}`,
						}}
					>
						<Tracked size={9} style={{ color: t.inkGhost, width: 20, paddingTop: 3, flexShrink: 0 }}>
							{String(i + 1).padStart(2, "0")}
						</Tracked>
						<div style={{ flex: 1 }}>
							<div
								style={{
									fontFamily: "Playfair Display, serif",
									fontSize: 15,
									color: t.ink,
									lineHeight: 1.4,
								}}
							>
								{lesson.title}
							</div>
							{lesson.summary && (
								<div style={{ fontSize: 12, color: t.inkGhost, marginTop: 3, lineHeight: 1.5 }}>
									{lesson.summary}
								</div>
							)}
						</div>
					</div>
				))}
			</div>

			{/* Tags */}
			{draft.tags && draft.tags.length > 0 && (
				<div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
					{draft.tags.map((tag, i) => (
						<span
							key={i}
							style={{
								fontFamily: "JetBrains Mono, monospace",
								fontSize: 9,
								letterSpacing: "0.1em",
								padding: "3px 8px",
								background: t.bgCard,
								color: t.inkGhost,
							}}
						>
							{tag}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

// ── Component ───────────────────────────────────────────────
export default function CommandCenter({ loaderData }: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();
	const navigate = useNavigate();
	const [prompt, setPrompt] = useState("");
	const [selectedModel, setSelectedModel] = useState("AUTO");

	// Chat state
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [streaming, setStreaming] = useState(false);
	const [chatInput, setChatInput] = useState("");
	const [composeError, setComposeError] = useState("");
	const [approving, setApproving] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const chatEndRef = useRef<HTMLDivElement | null>(null);

	// AI suggestions
	const [aiSuggestions, setAiSuggestions] = useState<{ title: string; reason: string; prompt: string }[]>([]);
	const [loadingSuggestions, setLoadingSuggestions] = useState(false);

	const { courses, totalLessons, reviewsDue } = loaderData;
	const inSession = chatMessages.length > 0 || streaming;

	// Auto-scroll chat
	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [chatMessages, streamingContent]);

	// Get the latest draft from the most recent AI message
	const latestAIMessage = [...chatMessages].reverse().find((m) => m.role === "assistant");
	const currentDraft = useMemo(
		() => (latestAIMessage ? extractDraft(latestAIMessage.content) : null),
		[latestAIMessage],
	);

	// Get suggestion chips from the latest AI message
	const suggestions = useMemo(
		() => (latestAIMessage ? extractSuggestions(latestAIMessage.content) : []),
		[latestAIMessage],
	);

	const sendMessage = useCallback(async (userMessage: string, history: ChatMessage[]) => {
		if (streaming) return;
		setStreaming(true);
		setStreamingContent("");
		setComposeError("");

		const newMessages: ChatMessage[] = [...history, { role: "user", content: userMessage }];
		setChatMessages(newMessages);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const fullResponse = await streamPlanCourse(
				{
					prompt: newMessages[0].content,
					model: MODEL_MAP[selectedModel],
					messages: newMessages,
				},
				(delta) => setStreamingContent((prev) => prev + delta),
				controller.signal,
			);

			setChatMessages((prev) => [...prev, { role: "assistant", content: fullResponse }]);
			setStreamingContent("");
		} catch (err) {
			if ((err as Error).name !== "AbortError") {
				setComposeError((err as Error).message || "Connection failed");
			}
		} finally {
			setStreaming(false);
			abortRef.current = null;
		}
	}, [selectedModel, streaming]);

	const handleCompose = useCallback(() => {
		if (!prompt.trim()) return;
		sendMessage(prompt.trim(), []);
	}, [prompt, sendMessage]);

	const handleChatSend = useCallback(() => {
		if (!chatInput.trim()) return;
		const msg = chatInput.trim();
		setChatInput("");
		sendMessage(msg, chatMessages);
	}, [chatInput, chatMessages, sendMessage]);

	const handleSuggestionClick = useCallback((suggestion: string) => {
		sendMessage(suggestion, chatMessages);
	}, [chatMessages, sendMessage]);

	const handleApprove = useCallback(async () => {
		if (!currentDraft || approving) return;
		setApproving(true);
		setComposeError("");

		try {
			const res = await fetch("/learning/api/courses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(currentDraft),
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
			setApproving(false);
		}
	}, [currentDraft, approving, navigate]);

	const handleDiscard = useCallback(() => {
		setChatMessages([]);
		setStreamingContent("");
		setComposeError("");
		setChatInput("");
		setPrompt("");
	}, []);

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleChatSend();
		}
	}, [handleChatSend]);

	// Load AI suggestions when courses exist
	useEffect(() => {
		if (courses.length > 0 && aiSuggestions.length === 0 && !loadingSuggestions) {
			setLoadingSuggestions(true);
			fetch("/learning/api/ai/suggest-courses", { method: "POST" })
				.then((r) => r.json())
				.then((data) => {
					if (data.suggestions) setAiSuggestions(data.suggestions);
				})
				.catch(() => {})
				.finally(() => setLoadingSuggestions(false));
		}
	}, [courses.length]);

	const models = ["OPUS", "SONNET", "HAIKU", "AUTO"] as const;
	const continueCourses = courses.slice(0, 3);

	const templates = [
		{ label: "Quick intro", desc: "30 min · 3-4 focused lessons", prompt: "Create a focused 30-minute introduction to " },
		{ label: "Weekend deep dive", desc: "4-6 hours · 8-10 lessons", prompt: "Design a comprehensive weekend course on " },
		{ label: "30-day challenge", desc: "Daily micro-lessons · 15 min each", prompt: "Build a 30-day learning challenge for " },
		{ label: "Project-based", desc: "Learn by building something real", prompt: "Create a project-based course where I build something real with " },
	];

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

				{/* Initial compose — before session */}
				{!inSession && (
					<>
						<div style={{ marginTop: 48, position: "relative" }}>
							<UnderlineInput
								t={t}
								multiline
								rows={2}
								value={prompt}
								onChange={setPrompt}
								placeholder="Teach me… / Build a course on…"
							/>
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
								<svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: t.inkGhost }}>
									<path d="M1.5 3.5L4.5 6.5L7.5 3.5" />
								</svg>
							</div>
						</div>

						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
							<div style={{ display: "flex", gap: 8 }}>
								{models.map((m) => (
									<Chip key={m} t={t} active={m === selectedModel} onClick={() => setSelectedModel(m)}>
										{m}
									</Chip>
								))}
							</div>
							<TrackedButton t={t} primary disabled={!prompt.trim()} onClick={handleCompose}>
								COMPOSE
							</TrackedButton>
						</div>

						{/* Course templates */}
						<div style={{ marginTop: 32 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
								<Rule width={40} color={t.inkGhost} />
								<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
									QUICK START
								</Tracked>
							</div>
							<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0, borderTop: `1px solid ${t.divider}` }}>
								{templates.map((tmpl, i) => (
									<div
										key={i}
										onClick={() => setPrompt(tmpl.prompt)}
										style={{
											padding: "16px 18px",
											borderBottom: `1px solid ${t.divider}`,
											borderRight: i % 2 === 0 ? `1px solid ${t.divider}` : "none",
											cursor: "pointer",
											transition: "background .25s",
										}}
										onMouseEnter={(e) => { e.currentTarget.style.background = t.bgCard; }}
										onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
									>
										<div style={{ fontFamily: "Playfair Display, serif", fontSize: 15, color: t.ink, marginBottom: 4 }}>
											{tmpl.label}
										</div>
										<Tracked size={9} tracking={0.15} style={{ color: t.inkGhost }}>
											{tmpl.desc}
										</Tracked>
									</div>
								))}
							</div>
						</div>

						{/* Review due alert */}
						{reviewsDue > 0 && (
							<div
								onClick={() => navigate("/learning/progress")}
								style={{
									marginTop: 24,
									padding: "14px 18px",
									border: `1px solid ${t.accent}`,
									display: "flex",
									alignItems: "center",
									gap: 12,
									cursor: "pointer",
								}}
							>
								<FilmDot size={6} breathe />
								<span style={{ fontFamily: "Playfair Display, serif", fontSize: 14, color: t.ink, flex: 1 }}>
									{reviewsDue} {reviewsDue === 1 ? "lesson" : "lessons"} due for review
								</span>
								<Tracked size={9} tracking={0.2} style={{ color: t.inkGhost }}>
									REVIEW NOW →
								</Tracked>
							</div>
						)}

						{/* AI-powered suggestions */}
						{aiSuggestions.length > 0 && (
							<div style={{ marginTop: 32 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
									<Rule width={40} color={t.inkGhost} />
									<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
										SUGGESTED FOR YOU
									</Tracked>
								</div>
								{aiSuggestions.map((s, i) => (
									<div
										key={i}
										onClick={() => { setPrompt(s.prompt); }}
										style={{
											padding: "16px 0",
											borderTop: `1px solid ${t.divider}`,
											cursor: "pointer",
											display: "flex",
											gap: 16,
											alignItems: "baseline",
										}}
									>
										<Tracked size={9} style={{ color: t.inkGhost, width: 20 }}>
											{String(i + 1).padStart(2, "0")}
										</Tracked>
										<div style={{ flex: 1 }}>
											<div style={{ fontFamily: "Playfair Display, serif", fontSize: 16, color: t.ink }}>
												{s.title}
											</div>
											<div style={{ fontSize: 12, color: t.inkGhost, marginTop: 4, fontStyle: "italic" }}>
												{s.reason}
											</div>
										</div>
										<span style={{ color: t.inkGhost }}>→</span>
									</div>
								))}
							</div>
						)}
					</>
				)}

				{/* ── Chat session ──────────────────────────────────── */}
				{inSession && (
					<div style={{ marginTop: 48 }}>
						{/* Chat thread */}
						<div style={{ marginBottom: 24 }}>
							{chatMessages.map((msg, i) => (
								<div key={i} style={{ padding: "20px 0", borderBottom: `1px solid ${t.divider}` }}>
									{/* Role label */}
									<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
										{msg.role === "user" ? (
											<FilmDot size={5} />
										) : (
											<span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: t.inkGhost }} />
										)}
										<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost }}>
											{msg.role === "user" ? "YOU" : "ORACLE"}
										</Tracked>
									</div>

									{msg.role === "assistant" ? (
										<div>
											{/* Conversational text (no JSON, no suggestion tags) */}
											<div
												style={{
													fontFamily: "Playfair Display, serif",
													fontSize: 16,
													lineHeight: 1.75,
													color: t.ink,
													whiteSpace: "pre-wrap",
												}}
											>
												{stripSuggestions(extractConversation(msg.content))}
											</div>

											{/* Visual course preview */}
											{extractDraft(msg.content) && (
												<CoursePreviewCard draft={extractDraft(msg.content)!} t={t} />
											)}

											{/* Suggestion chips — only show on last AI message */}
											{i === chatMessages.length - 1 && !streaming && extractSuggestions(msg.content).length > 0 && (
												<div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
													{extractSuggestions(msg.content).map((s, j) => (
														<button
															key={j}
															onClick={() => handleSuggestionClick(s)}
															style={{
																fontFamily: "Playfair Display, serif",
																fontSize: 13,
																fontStyle: "italic",
																padding: "8px 16px",
																border: `1px solid ${t.divider}`,
																background: "transparent",
																color: t.ink,
																cursor: "pointer",
																transition: "all .25s",
																borderRadius: 0,
															}}
															onMouseEnter={(e) => {
																e.currentTarget.style.borderColor = t.dividerStrong;
																e.currentTarget.style.color = t.inkStrong;
															}}
															onMouseLeave={(e) => {
																e.currentTarget.style.borderColor = t.divider;
																e.currentTarget.style.color = t.ink;
															}}
														>
															{s}
														</button>
													))}
												</div>
											)}
										</div>
									) : (
										<div
											style={{
												fontFamily: "Playfair Display, serif",
												fontSize: 16,
												lineHeight: 1.75,
												color: t.ink,
												fontStyle: "italic",
											}}
										>
											{msg.content}
										</div>
									)}
								</div>
							))}

							{/* Streaming AI response */}
							{streaming && streamingContent && (
								<div style={{ padding: "20px 0", borderBottom: `1px solid ${t.divider}` }}>
									<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
										<FilmDot size={5} breathe />
										<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost }}>
											ORACLE
										</Tracked>
									</div>
									<div
										style={{
											fontFamily: "Playfair Display, serif",
											fontSize: 16,
											lineHeight: 1.75,
											color: t.ink,
											whiteSpace: "pre-wrap",
										}}
									>
										{stripSuggestions(extractConversation(streamingContent))}
									</div>
								</div>
							)}

							{/* Thinking indicator */}
							{streaming && !streamingContent && (
								<div style={{ padding: "20px 0", display: "flex", alignItems: "center", gap: 10 }}>
									<FilmDot size={5} breathe />
									<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost }}>
										THINKING…
									</Tracked>
								</div>
							)}

							<div ref={chatEndRef} />
						</div>

						{/* Chat input */}
						{!streaming && (
							<div style={{ marginBottom: 20 }}>
								<div style={{ display: "flex", gap: 12, alignItems: "flex-end" }} onKeyDown={handleKeyDown}>
									<div style={{ flex: 1 }}>
										<UnderlineInput
											t={t}
											multiline
											rows={1}
											value={chatInput}
											onChange={setChatInput}
											placeholder="Tell me more, ask for changes, or pick a suggestion above…"
										/>
									</div>
									<TrackedButton t={t} disabled={!chatInput.trim()} onClick={handleChatSend}>
										SEND
									</TrackedButton>
								</div>
							</div>
						)}

						{streaming && (
							<div style={{ marginBottom: 20 }}>
								<TrackedButton t={t} onClick={() => abortRef.current?.abort()}>
									STOP
								</TrackedButton>
							</div>
						)}

						{/* Error */}
						{composeError && (
							<div style={{ marginBottom: 16, color: t.accent, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
								{composeError}
							</div>
						)}

						{/* Action bar */}
						{!streaming && (
							<div
								style={{
									display: "flex",
									gap: 12,
									justifyContent: "flex-end",
									paddingTop: 12,
									borderTop: `1px solid ${t.divider}`,
								}}
							>
								<TrackedButton t={t} onClick={handleDiscard}>
									START OVER
								</TrackedButton>
								<TrackedButton t={t} primary disabled={!currentDraft || approving} onClick={handleApprove}>
									{approving ? "CREATING…" : "APPROVE & CREATE"}
								</TrackedButton>
							</div>
						)}
					</div>
				)}

				{/* Continue learning — hidden during session */}
				{!inSession && hasCourses && (
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
										onMouseEnter={(e) => { e.currentTarget.style.background = t.bgCard; }}
										onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
									>
										<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
											<span style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkGhost, fontWeight: 500 }}>
												{c.cover_monogram || c.title[0]}
											</span>
											<Tracked size={9} tracking={0.22} style={{ color: t.inkGhost }}>
												{sourceLabel} · {prog}%
											</Tracked>
										</div>
										<div style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: t.inkStrong, lineHeight: 1.15, marginBottom: 6 }}>
											{c.title}
										</div>
										{c.subtitle && (
											<div style={{ fontSize: 13, color: t.inkMuted, fontStyle: "italic", fontFamily: "Playfair Display, serif", marginBottom: 20 }}>
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

				{!inSession && !hasCourses && (
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
									<span style={{ fontFamily: "Playfair Display, serif", fontSize: 18, color: t.ink, fontStyle: "italic", flex: 1 }}>
										"{s}"
									</span>
									<span style={{ color: t.inkGhost }}>→</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Footer */}
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
