/**
 * Zod schemas for AI-generated course content.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

export const ProseBlockSchema = z.object({
  type: z.literal("prose"),
  markdown: z.string(),
});

export const HeadingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string(),
});

export const MermaidBlockSchema = z.object({
  type: z.literal("mermaid"),
  code: z.string(),
  caption: z.string().optional(),
});

export const KatexBlockSchema = z.object({
  type: z.literal("katex"),
  expression: z.string(),
  display: z.boolean().optional(),
  caption: z.string().optional(),
});

export const CodeBlockSchema = z.object({
  type: z.literal("code"),
  language: z.string(),
  code: z.string(),
  filename: z.string().optional(),
  caption: z.string().optional(),
});

export const InteractiveBlockSchema = z.object({
  type: z.literal("interactive"),
  widget: z.string(),
  props: z.record(z.unknown()),
  caption: z.string().optional(),
});

export const CalloutBlockSchema = z.object({
  type: z.literal("callout"),
  variant: z.enum(["info", "warning", "tip", "danger"]),
  title: z.string().optional(),
  markdown: z.string(),
});

export const ImageBlockSchema = z.object({
  type: z.literal("image"),
  src: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
});

export const QuoteBlockSchema = z.object({
  type: z.literal("quote"),
  markdown: z.string(),
  attribution: z.string().optional(),
});

export const BlockSchema = z.discriminatedUnion("type", [
  ProseBlockSchema,
  HeadingBlockSchema,
  MermaidBlockSchema,
  KatexBlockSchema,
  CodeBlockSchema,
  InteractiveBlockSchema,
  CalloutBlockSchema,
  ImageBlockSchema,
  QuoteBlockSchema,
]);

export type Block = z.infer<typeof BlockSchema>;

// ---------------------------------------------------------------------------
// CourseDraft
// ---------------------------------------------------------------------------

export const LessonOutlineSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  outcomes: z.array(z.string()),
});

export const CourseDraftSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  language: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimated_minutes: z.number().optional(),
  tags: z.array(z.string()),
  cover_monogram: z.string().optional(),
  lessons: z.array(LessonOutlineSchema),
});

export type CourseDraft = z.infer<typeof CourseDraftSchema>;
export type LessonOutline = z.infer<typeof LessonOutlineSchema>;

// ---------------------------------------------------------------------------
// QuizQuestion
// ---------------------------------------------------------------------------

export const QuizChoiceSchema = z.object({
  label: z.string(),
  correct: z.boolean(),
  explanation: z.string().optional(),
});

export const QuizQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("multiple_choice"),
    question: z.string(),
    choices: z.array(QuizChoiceSchema).min(2),
    explanation: z.string().optional(),
  }),
  z.object({
    type: z.literal("true_false"),
    question: z.string(),
    correct: z.boolean(),
    explanation: z.string().optional(),
  }),
  z.object({
    type: z.literal("short_answer"),
    question: z.string(),
    rubric: z.string(),
    sample_answer: z.string().optional(),
  }),
]);

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

// ---------------------------------------------------------------------------
// Request body schemas for API routes
// ---------------------------------------------------------------------------

export const PlanCourseBody = z.object({
	prompt: z.string().min(1).max(5000),
	model: z.string().optional(),
});

export const GenerateLessonBody = z.object({
	lessonId: z.string().uuid(),
	model: z.string().optional(),
});

export const ChatBody = z.object({
	threadId: z.string().uuid().optional(),
	message: z.string().min(1).max(10000),
	scope: z.string().min(1),
	scopeId: z.string().min(1),
	model: z.string().optional(),
});

export const RefineBlockBody = z.object({
	blockId: z.string().uuid(),
	instruction: z.string().min(1).max(5000),
	model: z.string().optional(),
});

export const GenerateQuizBody = z.object({
	lessonId: z.string().uuid(),
	count: z.number().int().min(1).max(20).optional().default(5),
	model: z.string().optional(),
});

export const GradeBody = z.object({
	quizId: z.string().uuid(),
	questionId: z.string().uuid(),
	answer: z.string().min(1).max(5000),
});
