/**
 * System prompt for generating quiz questions from lesson content.
 */

export interface GenerateQuizInput {
	lessonTitle: string;
	lessonContent: string;
	count: number;
}

export function generateQuizSystem(input: GenerateQuizInput): string {
	return `You are a quiz designer for an online learning platform. Generate exactly ${input.count} quiz questions based on the lesson content below.

Lesson: "${input.lessonTitle}"

Return ONLY a JSON object (no markdown fences, no commentary) matching this schema:

{
  "title": "Quiz: ${input.lessonTitle}",
  "questions": [
    // One of:
    { "type": "multiple_choice", "question": string, "choices": [{ "label": string, "correct": boolean, "explanation"?: string }], "explanation"?: string }
    { "type": "true_false", "question": string, "correct": boolean, "explanation"?: string }
    { "type": "short_answer", "question": string, "rubric": string, "sample_answer"?: string }
  ]
}

Guidelines:
- Mix question types: use mostly multiple_choice, with some true_false and short_answer.
- Questions should test understanding, not just recall.
- For multiple_choice, include 4 choices with exactly one correct.
- Explanations should clarify why the answer is correct.
- Rubric for short_answer should describe what a good answer includes.

Lesson content:
${input.lessonContent}`;
}
