/**
 * Teach It Back — structured feedback on student's explanation.
 */

export interface TeachItBackInput {
  lessonTitle: string;
  lessonContent: string;
  audience: string;
  explanation: string;
  language?: string;
}

export function teachItBackPrompt(input: TeachItBackInput): string {
  const lang = input.language ?? "en";
  return `You are an expert learning assessor. A student just finished a lesson and is trying to teach the concept to someone else using their own words.

Lesson: "${input.lessonTitle}"
Target audience: ${input.audience}
Original lesson content (summary):
${input.lessonContent.slice(0, 3000)}

Student's explanation:
"${input.explanation}"

Analyse the student's explanation and provide structured feedback in 4 sections:

1. **Understood Deeply** — parts where the student used their own analogies, went beyond the lesson, connected to other topics
2. **Accurate but Parroted** — correct but just rephrased the lesson verbatim without showing understanding
3. **Gaps** — important things the lesson covered that the student didn't mention at all
4. **Inaccuracies** — things the student said that don't match the lesson content

Be encouraging but honest. Acknowledge effort. Write in ${lang}.

Return as a JSON object:
\`\`\`json
{
  "understood": "paragraph about what they truly understood",
  "parroted": "paragraph about what was accurate but surface-level",
  "gaps": "paragraph about what was missed",
  "inaccuracies": "paragraph about what was wrong (or 'none found' if all accurate)"
}
\`\`\`

Return ONLY the JSON.`;
}
