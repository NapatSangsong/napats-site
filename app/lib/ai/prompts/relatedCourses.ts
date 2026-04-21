/**
 * Prompt for suggesting related courses after completing one.
 */

export interface RelatedCoursesInput {
  completedCourse: { title: string; tags: string[]; description?: string | null };
  existingCourses: { title: string; tags: string[] }[];
  language?: string;
}

export function relatedCoursesPrompt(input: RelatedCoursesInput): string {
  const lang = input.language ?? "en";
  const existing = input.existingCourses
    .map((c) => `- "${c.title}" (${c.tags.join(", ")})`)
    .join("\n");

  return `You are a learning advisor. The student just completed a course and wants to know what to learn next.

## Completed course
Title: "${input.completedCourse.title}"
Tags: ${input.completedCourse.tags.join(", ")}
${input.completedCourse.description ? `Description: ${input.completedCourse.description}` : ""}

## Already in their library
${existing || "Nothing else yet."}

## Rules
- Suggest 3 courses that naturally follow from what they just learned
- Don't suggest topics they already have in their library
- Mix depths: one that goes deeper, one that's adjacent, one that's surprising but connected
- Make each suggestion feel like a natural "what's next" moment
- Write in ${lang}

## Output format
Return a JSON array:
\`\`\`json
[
  {
    "title": "course title",
    "description": "2 sentences about what they'll learn and why it connects",
    "prompt": "pre-filled compose prompt",
    "connection": "one-line explanation of how it relates to what they just finished"
  }
]
\`\`\`

Return ONLY the JSON.`;
}
