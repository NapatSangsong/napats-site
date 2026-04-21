/**
 * System prompt for grading short-answer quiz responses.
 */

export interface GradeShortAnswerInput {
  question: string;
  rubric: string;
  sampleAnswer?: string;
  studentAnswer: string;
  language?: string;
}

export function gradeShortAnswerPrompt(input: GradeShortAnswerInput): string {
  const lang = input.language ?? "en";
  const sampleLine = input.sampleAnswer
    ? `\nSample answer: "${input.sampleAnswer}"`
    : "";

  return `You are a fair and constructive grader. Evaluate the student's answer to the following question.

Question: "${input.question}"
Rubric: "${input.rubric}"${sampleLine}
Student's answer: "${input.studentAnswer}"

Return a JSON object with this exact schema:

{
  "score": number,        // 0 to 100
  "correct": boolean,     // true if score >= 70
  "feedback": string      // 1-3 sentences of constructive feedback
}

Grading criteria:
- Award full marks (100) if the student demonstrates clear understanding, even if wording differs from the expected answer.
- Award partial credit (30-69) if the answer is partially correct or shows some understanding.
- Award minimal credit (1-29) if the answer shows a relevant attempt but is substantially wrong.
- Award zero (0) only if the answer is completely off-topic or blank.
- In feedback, acknowledge what the student got right before noting what was missed.
- Be encouraging but honest.
- Write feedback in "${lang}".
- Return ONLY the JSON object. No markdown fences, no commentary.`;
}
