import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("vault", "routes/vault.tsx"),
	route("vault/signin", "routes/vault-signin.tsx"),

	// Learning platform — API routes
	route("learning/gate", "routes/learning.gate.tsx"),
	route("learning/api/session", "routes/api/session.ts"),
	route("learning/api/courses", "routes/api/courses.ts"),
	route("learning/api/ai/plan-course", "routes/api/ai.plan-course.ts"),
	route("learning/api/ai/generate-lesson", "routes/api/ai.generate-lesson.ts"),
	route("learning/api/ai/chat", "routes/api/ai.chat.ts"),
	route("learning/api/ai/refine-block", "routes/api/ai.refine-block.ts"),
	route("learning/api/ai/generate-quiz", "routes/api/ai.generate-quiz.ts"),
	route("learning/api/ai/grade", "routes/api/ai.grade.ts"),
	route("learning/api/progress/:lessonId", "routes/api/progress.$lessonId.ts"),
	layout("routes/learning.tsx", [
		route("learning", "routes/learning._index.tsx"),
		route("learning/library", "routes/learning.library.tsx"),
		route("learning/progress", "routes/learning.progress.tsx"),
		route("learning/settings", "routes/learning.settings.tsx"),
		route("learning/courses/:slug", "routes/learning.courses.$slug.tsx"),
		route("learning/courses/:slug/lessons/:lesson", "routes/learning.courses.$slug.lessons.$lesson.tsx"),
		route("learning/courses/:slug/lessons/:lesson/quiz", "routes/learning.courses.$slug.lessons.$lesson.quiz.tsx"),
	]),
] satisfies RouteConfig;
