/**
 * Prompt for generating personalized course suggestions
 * based on the user's library and progress.
 */

export interface SuggestCoursesInput {
  courses: { title: string; tags: string[]; difficulty: string; progressPercent: number }[];
  learningStyle?: { reading: boolean; watching: boolean; doing: boolean };
  language?: string;
}

export function suggestCoursesPrompt(input: SuggestCoursesInput): string {
  const lang = input.language ?? "en";
  const courseList = input.courses
    .map((c) => `- "${c.title}" (${c.difficulty}, ${c.progressPercent}% complete, tags: ${c.tags.join(", ")})`)
    .join("\n");

  const styleNote = input.learningStyle
    ? `\nThe student prefers: ${[
        input.learningStyle.reading && "reading",
        input.learningStyle.watching && "watching videos",
        input.learningStyle.doing && "hands-on projects",
      ].filter(Boolean).join(", ")}.`
    : "";

  return `You are a learning advisor. Based on the student's library and progress, suggest 3 personalized course topics they should explore next.

## Student's library
${courseList || "No courses yet."}
${styleNote}

## Rules
- Suggest topics that naturally extend or complement what they've studied
- Consider their progress: if they're mid-course, suggest related topics they could explore after finishing
- If they've completed courses, suggest deeper or adjacent topics
- Each suggestion should feel exciting and relevant, not generic
- Write in ${lang}

## Output format
Return a JSON array of exactly 3 suggestions:
\`\`\`json
[
  {
    "title": "suggested course title",
    "reason": "one sentence explaining why this fits their journey",
    "prompt": "a pre-filled compose prompt the user can click to start"
  }
]
\`\`\`

Return ONLY the JSON. No other text.`;
}
