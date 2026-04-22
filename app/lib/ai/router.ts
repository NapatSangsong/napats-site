/**
 * Automatic model selection based on task type and input characteristics.
 * Default provider: Gemini (cost-effective). Falls back to Claude for specific tasks.
 */

export type AIAction =
  | "planCourse"
  | "generateLesson"
  | "generateQuiz"
  | "gradeShortAnswer"
  | "chat"
  | "socraticRecall"
  | "deepDive"
  | "perspectiveLesson"
  | "suggestTitle"
  | "summarise"
  | "buildGraph"
  | "translate";

export type Provider = "gemini" | "anthropic";

export interface ModelSelection {
  model: string;
  provider: Provider;
}

// Claude models (default)
const CLAUDE_OPUS = "claude-opus-4-7";
const CLAUDE_SONNET = "claude-sonnet-4-6";
const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";

// Gemini models (available when GEMINI_API_KEY is set)
const GEMINI_PRO = "gemini-2.5-pro-preview-06-05";
const GEMINI_FLASH = "gemini-2.5-flash-preview-05-20";

export function selectModel(action: AIAction, inputLength?: number): ModelSelection {
  switch (action) {
    case "planCourse":
      return { model: CLAUDE_SONNET, provider: "anthropic" };

    case "generateLesson":
    case "generateQuiz":
    case "gradeShortAnswer":
    case "socraticRecall":
    case "deepDive":
    case "perspectiveLesson":
      return { model: CLAUDE_SONNET, provider: "anthropic" };

    case "chat":
      return inputLength !== undefined && inputLength < 200
        ? { model: CLAUDE_HAIKU, provider: "anthropic" }
        : { model: CLAUDE_SONNET, provider: "anthropic" };

    case "suggestTitle":
    case "summarise":
    case "buildGraph":
    case "translate":
      return { model: CLAUDE_HAIKU, provider: "anthropic" };
  }
}

/**
 * Legacy helper — returns just the model string for backward compat.
 * @deprecated Use selectModel() which returns { model, provider }
 */
export function selectModelString(action: AIAction, inputLength?: number): string {
  return selectModel(action, inputLength).model;
}
