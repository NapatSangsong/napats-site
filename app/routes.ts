import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),

	// LINE Bot
	route("line/webhook", "routes/line.webhook.ts"),
	route("line/decision", "routes/line.decision.ts"),
	route("vault", "routes/vault.tsx"),
	route("vault/signin", "routes/vault-signin.tsx"),

	// Energy dashboard (private, key-gated, not in nav)
	route("energy", "routes/energy.tsx"),
	route("api/energy/live", "routes/api/energy.live.ts"),
	route("api/energy/history", "routes/api/energy.history.ts"),
	route("api/energy/weather", "routes/api/energy.weather.ts"),
	route("api/energy/solar", "routes/api/energy.solar.ts"),
	route("api/energy/grid", "routes/api/energy.grid.ts"),

	// Learning platform — API routes
	route("learning/gate", "routes/learning.gate.tsx"),
	route("learning/api/session", "routes/api/session.ts"),
	route("learning/api/courses", "routes/api/courses.ts"),
	route("learning/api/settings", "routes/api/settings.ts"),
	route("learning/api/ai/plan-course", "routes/api/ai.plan-course.ts"),
	route("learning/api/ai/generate-lesson", "routes/api/ai.generate-lesson.ts"),
	route("learning/api/ai/perspective-lesson", "routes/api/ai.perspective-lesson.ts"),
	route("learning/api/ai/chat", "routes/api/ai.chat.ts"),
	route("learning/api/ai/refine-block", "routes/api/ai.refine-block.ts"),
	route("learning/api/ai/generate-quiz", "routes/api/ai.generate-quiz.ts"),
	route("learning/api/ai/grade", "routes/api/ai.grade.ts"),
	route("learning/api/ai/suggest-courses", "routes/api/ai.suggest-courses.ts"),
	route("learning/api/ai/related-courses", "routes/api/ai.related-courses.ts"),
	route("learning/api/ai/build-graph", "routes/api/ai.build-graph.ts"),
	route("learning/api/ai/deep-dive", "routes/api/ai.deep-dive.ts"),
	route("learning/api/ai/translate", "routes/api/ai.translate.ts"),
	route("learning/api/ai/chat-history", "routes/api/ai.chat-history.ts"),
	route("learning/api/notes", "routes/api/notes.ts"),
	route("learning/api/journal", "routes/api/journal.ts"),
	route("learning/api/progress/:lessonId", "routes/api/progress.$lessonId.ts"),
	route("learning/api/review-schedule", "routes/api/review-schedule.ts"),
	route("learning/api/graph", "routes/api/graph.ts"),
	route("learning/api/export", "routes/api/export.ts"),
	route("learning/api/import", "routes/api/import.ts"),
	layout("routes/learning.tsx", [
		route("learning", "routes/learning._index.tsx"),
		route("learning/library", "routes/learning.library.tsx"),
		route("learning/progress", "routes/learning.progress.tsx"),
		route("learning/settings", "routes/learning.settings.tsx"),
		route("learning/guide", "routes/learning.guide.tsx"),
		route("learning/graph", "routes/learning.graph.tsx"),
		route("learning/courses/:slug", "routes/learning.courses.$slug.tsx"),
		route("learning/courses/:slug/lessons/:lesson", "routes/learning.courses.$slug.lessons.$lesson.tsx"),
		route("learning/courses/:slug/lessons/:lesson/quiz", "routes/learning.courses.$slug.lessons.$lesson.quiz.tsx"),
	]),
] satisfies RouteConfig;
