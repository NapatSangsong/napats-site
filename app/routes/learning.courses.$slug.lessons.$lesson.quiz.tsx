/**
 * Quiz screen — MCQ, code challenge, short answer (AI-graded).
 * Matches the design's QuizScreen component.
 */
import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/learning.courses.$slug.lessons.$lesson.quiz";
import { useTheme } from "./learning";
import { createServiceClient } from "~/lib/supabase.server";
import { TopBar } from "~/components/learning/TopBar";
import { Tracked, FilmDot, TrackedButton } from "~/components/learning/primitives";

export function meta() {
	return [{ title: "Napat · Learning · Quiz" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const supabase = createServiceClient(env);

	const { data: course } = await supabase
		.from("courses")
		.select("id, slug, title, lessons(id, order_index, title)")
		.eq("slug", params.slug)
		.single();
	if (!course) throw new Response("not found.", { status: 404 });

	const lessonIndex = parseInt(params.lesson, 10);
	const lesson = (course.lessons || []).find((l: { order_index: number }) => l.order_index === lessonIndex);
	if (!lesson) throw new Response("lesson not found.", { status: 404 });

	// Get existing quiz or return null
	const { data: quiz } = await supabase
		.from("quizzes")
		.select("*")
		.eq("lesson_id", lesson.id)
		.order("created_at", { ascending: false })
		.limit(1)
		.single();

	return { course, lesson, quiz };
}

interface Question {
	id: string;
	kind: "mcq" | "code" | "short" | "truefalse" | "fillin";
	q: string;
	options?: { k: string; text: string }[];
	correct?: string;
	starter?: string;
	test?: string;
}

export default function QuizPage({ loaderData }: Route.ComponentProps) {
	const { theme, t, toggleTheme } = useTheme();
	const navigate = useNavigate();
	const { course, lesson, quiz: existingQuiz } = loaderData;
	const [qi, setQi] = useState(0);
	const [answers, setAnswers] = useState<Record<number, string>>({});
	const [grading, setGrading] = useState(false);
	const [feedback, setFeedback] = useState<{ score: number; feedback: string } | null>(null);
	const [showResult, setShowResult] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [questions, setQuestions] = useState<Question[]>(
		existingQuiz?.questions || [],
	);

	const generateQuiz = useCallback(async () => {
		setGenerating(true);
		try {
			const res = await fetch("/learning/api/ai/generate-quiz", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: window.location.origin },
				body: JSON.stringify({ lessonId: lesson.id, count: 5 }),
			});
			if (res.ok) {
				const data = await res.json();
				setQuestions(data.questions || []);
			}
		} catch {
			// Error
		} finally {
			setGenerating(false);
		}
	}, [lesson.id]);

	// Auto-generate if no quiz exists
	if (questions.length === 0 && !generating) {
		generateQuiz();
	}

	const cur = questions[qi];
	const setAns = (v: string) => setAnswers((a) => ({ ...a, [qi]: v }));

	const submitShort = async () => {
		const text = answers[qi] || "";
		if (!text.trim()) return;
		setGrading(true);
		try {
			const res = await fetch("/learning/api/ai/grade", {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: window.location.origin },
				body: JSON.stringify({ quizId: existingQuiz?.id, questionId: cur?.id, answer: text }),
			});
			if (res.ok) {
				const data = await res.json();
				setFeedback(data);
			}
		} catch {
			setFeedback({ score: 7, feedback: "the oracle is silent. but your instincts are close." });
		} finally {
			setGrading(false);
		}
	};

	const next = () => {
		setFeedback(null);
		if (qi === questions.length - 1) setShowResult(true);
		else setQi(qi + 1);
	};

	// Loading state
	if (generating || questions.length === 0) {
		return (
			<div style={{ background: t.bg, color: t.ink, minHeight: "100vh", padding: "0 56px 80px" }}>
				<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />
				<div style={{ maxWidth: 720, margin: "0 auto", paddingTop: "20vh", textAlign: "center" }}>
					<span style={{ fontFamily: "Playfair Display, serif", fontSize: 28, color: t.inkMuted, fontStyle: "italic" }}>
						composing your quiz…
					</span>
					<span className="learning-breathe" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#cc0000", marginLeft: 14, verticalAlign: "middle" }} />
				</div>
			</div>
		);
	}

	// Result screen
	if (showResult) {
		const correctCount = questions.filter((q, i) => {
			if (q.kind === "mcq" || q.kind === "truefalse") return answers[i] === q.correct;
			return true; // Short/code counted as attempted
		}).length;

		return (
			<div style={{ background: t.bg, color: t.ink, minHeight: "100vh", padding: "0 56px 80px" }}>
				<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />
				<div style={{ maxWidth: 720, margin: "0 auto", paddingTop: "14vh" }}>
					<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost, display: "block", marginBottom: 24 }}>
						QUIZ · LESSON {lesson.order_index} · RESULT
					</Tracked>
					<div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
						<div style={{ fontFamily: "Playfair Display, serif", fontSize: 120, lineHeight: 1, color: t.inkStrong, fontWeight: 500 }}>
							{correctCount}<span style={{ color: t.inkGhost, margin: "0 14px" }}>/</span>{questions.length}
						</div>
						<FilmDot size={10} />
					</div>
					<div style={{ fontFamily: "Playfair Display, serif", fontSize: 24, color: t.inkMuted, fontStyle: "italic", marginTop: 14, maxWidth: 540 }}>
						well done. the next lesson is ready.
					</div>

					{/* Per-question results */}
					<div style={{ marginTop: 48, borderTop: `1px solid ${t.divider}` }}>
						{questions.map((q, i) => (
							<div key={i} style={{ display: "flex", gap: 20, padding: "22px 0", borderBottom: `1px solid ${t.divider}` }}>
								<Tracked size={10} tracking={0.25} style={{ color: t.inkGhost, width: 48 }}>
									Q.{String(i + 1).padStart(2, "0")}
								</Tracked>
								<div style={{ flex: 1 }}>
									<div style={{ fontFamily: "Playfair Display, serif", fontSize: 17, color: t.ink, fontStyle: "italic", marginBottom: 8 }}>
										{q.q}
									</div>
									<Tracked size={9} tracking={0.25} style={{ color: (q.kind === "mcq" && answers[i] === q.correct) ? t.inkMuted : t.accent }}>
										{(q.kind === "mcq" && answers[i] === q.correct) ? "CORRECT" : "REVIEW"}
									</Tracked>
								</div>
							</div>
						))}
					</div>

					<div style={{ display: "flex", justifyContent: "space-between", marginTop: 48 }}>
						<TrackedButton t={t} ghost onClick={() => { setShowResult(false); setQi(0); setAnswers({}); }}>
							RETRY
						</TrackedButton>
						<TrackedButton t={t} primary onClick={() => navigate(`/learning/courses/${course.slug}`)}>
							BACK TO COURSE →
						</TrackedButton>
					</div>
				</div>
			</div>
		);
	}

	// Question screen
	return (
		<div style={{ background: t.bg, color: t.ink, minHeight: "100vh", padding: "0 56px 80px" }}>
			<TopBar t={t} theme={theme} onToggleTheme={toggleTheme} />
			<div style={{ maxWidth: 720, margin: "0 auto", paddingTop: "8vh" }}>
				{/* Progress */}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
					<Tracked size={10} tracking={0.3} style={{ color: t.inkGhost }}>
						QUIZ · QUESTION {qi + 1} OF {questions.length}
					</Tracked>
					<div style={{ display: "flex", gap: 6 }}>
						{questions.map((_, i) => (
							<span key={i} style={{ width: 24, height: 1, background: i <= qi ? t.accent : t.divider }} />
						))}
					</div>
				</div>

				{/* Question */}
				<div style={{ fontFamily: "Playfair Display, serif", fontSize: 32, color: t.inkStrong, lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 36 }}>
					{cur.q}
				</div>

				{/* MCQ */}
				{cur.kind === "mcq" && cur.options && (
					<div style={{ borderTop: `1px solid ${t.divider}` }}>
						{cur.options.map((o) => {
							const sel = answers[qi] === o.k;
							return (
								<label key={o.k} onClick={() => setAns(o.k)} style={{
									display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 16,
									alignItems: "center", padding: "20px 4px",
									borderBottom: `1px solid ${t.divider}`, cursor: "pointer",
									background: sel ? t.bgCard : "transparent",
								}}>
									<span style={{ fontFamily: "Playfair Display, serif", fontSize: 26, color: sel ? t.inkStrong : t.inkGhost, fontWeight: 500 }}>
										{o.k}
									</span>
									<span style={{ fontSize: 16, color: sel ? t.inkStrong : t.ink }}>{o.text}</span>
									{sel && <FilmDot size={5} />}
								</label>
							);
						})}
					</div>
				)}

				{/* Code */}
				{cur.kind === "code" && (
					<div>
						<div style={{ background: "#0d0d0d", border: `1px solid ${t.divider}` }}>
							<div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
								<Tracked size={9} style={{ color: "rgba(255,255,255,0.3)" }}>CODE</Tracked>
								<Tracked size={9} style={{ color: "rgba(255,255,255,0.3)" }}>RUN →</Tracked>
							</div>
							<textarea
								value={answers[qi] || cur.starter || ""}
								onChange={(e) => setAns(e.target.value)}
								rows={7}
								style={{
									width: "100%", background: "transparent", border: "none", outline: "none",
									color: "#c9c9c9", fontFamily: "JetBrains Mono, monospace", fontSize: 13, lineHeight: 1.7,
									padding: 18, resize: "vertical", boxSizing: "border-box",
								}}
							/>
						</div>
					</div>
				)}

				{/* Short answer */}
				{cur.kind === "short" && (
					<div>
						<textarea
							value={answers[qi] || ""}
							onChange={(e) => setAns(e.target.value)}
							placeholder="two or three sentences is enough…"
							rows={5}
							style={{
								width: "100%", border: "none", outline: "none", resize: "vertical",
								background: "transparent", color: t.ink,
								fontFamily: "Playfair Display, serif", fontSize: 18, lineHeight: 1.6, fontStyle: "italic",
								padding: "12px 0", borderBottom: `1px solid ${t.dividerStrong}`, boxSizing: "border-box",
							}}
						/>
						{!feedback && (
							<div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
								<TrackedButton t={t} primary onClick={submitShort} disabled={grading}>
									{grading ? "GRADING…" : "SUBMIT FOR GRADING"}
								</TrackedButton>
							</div>
						)}
						{feedback && (
							<div style={{ marginTop: 28, border: `1px solid ${t.divider}`, padding: 24, background: t.bgCard }}>
								<div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 14 }}>
									<div style={{ fontFamily: "Playfair Display, serif", fontSize: 48, color: t.inkStrong, fontWeight: 500, lineHeight: 1 }}>
										{feedback.score}<span style={{ color: t.inkGhost }}>/10</span>
									</div>
									<Tracked size={9} tracking={0.3} style={{ color: t.inkGhost }}>MINSU · AI-GRADED</Tracked>
								</div>
								<div style={{ fontFamily: "Playfair Display, serif", fontSize: 17, color: t.ink, fontStyle: "italic", lineHeight: 1.6 }}>
									{feedback.feedback}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Navigation */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 48 }}>
					<TrackedButton t={t} ghost>
						ask the question differently
					</TrackedButton>
					{(cur.kind !== "short" || feedback) && (
						<TrackedButton t={t} primary onClick={next}>
							{qi === questions.length - 1 ? "FINISH" : "NEXT"}
						</TrackedButton>
					)}
				</div>
			</div>
		</div>
	);
}
