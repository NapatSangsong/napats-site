/**
 * POST /api/ai/perspective-lesson
 * Re-generate lesson content through a specific analytical lens.
 * Streams blocks via SSE (does NOT persist to Supabase — ephemeral view).
 */
import type { Route } from "./+types/ai.perspective-lesson";
import { BlockSchema } from "~/lib/ai/schemas";
import { streamChat } from "~/lib/ai/client";
import { selectModel } from "~/lib/ai/router";
import { perspectiveLessonPrompt } from "~/lib/ai/prompts/perspectiveLesson";
import type { Perspective } from "~/lib/ai/prompts/perspectiveLesson";
import { createServiceClient } from "~/lib/supabase.server";
import { requireAuth, sseResponse, createSSEStream } from "~/lib/ai/helpers.server";
import { z } from "zod";

const PerspectiveLessonBody = z.object({
	lessonId: z.string().uuid(),
	perspective: z.enum(["evolutionary", "neuro", "philosopher"]),
	model: z.string().optional(),
});

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof PerspectiveLessonBody.safeParse>;
	try {
		body = PerspectiveLessonBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const { lessonId, perspective, model: requestedModel } = body.data;
	const supabase = createServiceClient(env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

	// Fetch lesson + course context
	const { data: lesson, error: lessonError } = await supabase
		.from("lessons")
		.select("id, title, summary, outcomes, order, course_id, courses(title, language)")
		.eq("id", lessonId)
		.single();

	if (lessonError || !lesson) {
		return Response.json({ message: "lesson not found" }, { status: 404 });
	}

	const course = (lesson as Record<string, unknown>).courses as {
		title: string;
		language: string;
	} | null;

	const model = requestedModel ?? selectModel("perspectiveLesson");
	const systemPrompt = perspectiveLessonPrompt({
		courseTitle: course?.title ?? "Untitled Course",
		lessonTitle: lesson.title,
		lessonSummary: lesson.summary ?? undefined,
		outcomes: (lesson.outcomes as string[]) ?? [],
		perspective: perspective as Perspective,
		language: course?.language,
	});

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamChat(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
			[{ role: "user", content: `Rewrite the full lesson content for "${lesson.title}" through the ${perspective} perspective.` }],
			{ model, system: systemPrompt, maxTokens: 16384 },
		);

		// Accumulate full text
		let fullText = "";
		const reader = textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			fullText += value;
			send("delta", value);
		}

		// Parse blocks from accumulated JSON
		try {
			const parsed = JSON.parse(fullText);
			const arr = Array.isArray(parsed) ? parsed : [];
			const blocks = z.array(BlockSchema).parse(arr);

			// Send parsed blocks (ephemeral — not saved to DB)
			for (const block of blocks) {
				send("block", JSON.stringify(block));
			}
		} catch {
			send("error", JSON.stringify({ message: "failed to parse generated blocks" }));
			return;
		}

		send("end", "done");
	});

	return sseResponse(stream);
}
