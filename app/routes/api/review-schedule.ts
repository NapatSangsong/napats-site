/**
 * GET/PUT /learning/api/review-schedule
 * Spaced repetition review schedule.
 * GET: list pending reviews (due_at <= now, not completed)
 * PUT: mark a review as completed and schedule next interval
 */
import type { Route } from "./+types/review-schedule";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

const INTERVALS = [1, 3, 7, 14, 30, 60];

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const supabase = createServiceClient(env);
	const now = new Date().toISOString();

	const { data: due } = await supabase
		.from("review_schedule")
		.select("id, lesson_id, course_id, interval_days, due_at, courses(title, slug), lessons(title)")
		.is("completed_at", null)
		.lte("due_at", now)
		.order("due_at", { ascending: true });

	const { data: upcoming } = await supabase
		.from("review_schedule")
		.select("id, lesson_id, course_id, interval_days, due_at, courses(title, slug), lessons(title)")
		.is("completed_at", null)
		.gt("due_at", now)
		.order("due_at", { ascending: true })
		.limit(10);

	return Response.json({ due: due || [], upcoming: upcoming || [] });
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	if (request.method !== "PUT") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const body = await request.json() as { reviewId?: string; lessonId?: string; confidence?: string; score?: number };
	const supabase = createServiceClient(env);

	// Save confidence by lessonId (from Socratic Recall)
	if (body.lessonId && body.confidence) {
		const validConfidence = ["sure", "maybe", "guessed"];
		if (!validConfidence.includes(body.confidence)) {
			return Response.json({ message: "invalid confidence" }, { status: 400 });
		}
		// Find latest review for this lesson, or create one
		const { data: existing } = await supabase
			.from("review_schedule")
			.select("id")
			.eq("lesson_id", body.lessonId)
			.is("completed_at", null)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (existing) {
			await supabase.from("review_schedule").update({ confidence: body.confidence }).eq("id", existing.id);
		} else {
			// Get course_id from lesson
			const { data: lesson } = await supabase.from("lessons").select("course_id").eq("id", body.lessonId).single();
			if (lesson) {
				// Adjust interval based on confidence
				const intervalDays = body.confidence === "sure" ? 3 : body.confidence === "maybe" ? 1 : 1;
				const dueAt = new Date();
				dueAt.setDate(dueAt.getDate() + intervalDays);
				await supabase.from("review_schedule").insert({
					lesson_id: body.lessonId,
					course_id: lesson.course_id,
					interval_days: intervalDays,
					due_at: dueAt.toISOString(),
					confidence: body.confidence,
				});
			}
		}
		return Response.json({ ok: true });
	}

	if (!body.reviewId) {
		return Response.json({ message: "reviewId or lessonId+confidence required" }, { status: 400 });
	}

	// Get the current review
	const { data: review } = await supabase
		.from("review_schedule")
		.select("*")
		.eq("id", body.reviewId)
		.single();

	if (!review) {
		return Response.json({ message: "review not found" }, { status: 404 });
	}

	// Mark completed
	await supabase
		.from("review_schedule")
		.update({ completed_at: new Date().toISOString(), score: body.score ?? null })
		.eq("id", body.reviewId);

	// Schedule next interval
	const currentIdx = INTERVALS.indexOf(review.interval_days);
	const nextInterval = INTERVALS[Math.min(currentIdx + 1, INTERVALS.length - 1)];

	// Only schedule next if we haven't reached the end
	if (currentIdx < INTERVALS.length - 1) {
		const nextDue = new Date();
		nextDue.setDate(nextDue.getDate() + nextInterval);

		await supabase.from("review_schedule").insert({
			lesson_id: review.lesson_id,
			course_id: review.course_id,
			interval_days: nextInterval,
			due_at: nextDue.toISOString(),
		});
	}

	return Response.json({ ok: true, nextInterval });
}
