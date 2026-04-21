/**
 * Automatic model selection based on task type and input characteristics.
 */

export type AIAction =
  | "planCourse"
  | "generateLesson"
  | "generateQuiz"
  | "gradeShortAnswer"
  | "chat"
  | "suggestTitle"
  | "summarise";

const OPUS = "claude-opus-4-7";
const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";

export function selectModel(action: AIAction, inputLength?: number): string {
  switch (action) {
    case "planCourse":
      return OPUS;

    case "generateLesson":
    case "generateQuiz":
    case "gradeShortAnswer":
      return SONNET;

    case "chat":
      return inputLength !== undefined && inputLength < 200 ? HAIKU : SONNET;

    case "suggestTitle":
    case "summarise":
      return HAIKU;
  }
}
