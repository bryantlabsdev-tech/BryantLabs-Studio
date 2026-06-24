export const GEMINI_EMPTY_RESPONSE_ERROR =
  "Gemini returned an empty response.";

export const GEMINI_EMPTY_RESPONSE_CODE = "gemini_empty_response";

export type GeminiGenerateMethod = "generateContent" | "streamGenerateContent";

export interface GeminiResponseShape {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { message?: string };
}

type GeminiCandidate = NonNullable<GeminiResponseShape["candidates"]>[number];

function candidateText(candidate: GeminiCandidate | undefined): string {
  const parts = candidate?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

/**
 * Detect Gemini HTTP-200 responses with no usable model text.
 * Returns a user-facing error or null when the response is not empty.
 */
export function detectGeminiEmptyResponse(
  json: unknown,
  extractedText: string,
): string | null {
  const data = json as GeminiResponseShape;
  if (data?.error?.message) return null;
  if (data?.promptFeedback?.blockReason) return null;

  const text = extractedText.trim();
  if (text.length > 0) return null;

  const candidates = data?.candidates ?? [];
  const usage = data?.usageMetadata;
  const thoughts = usage?.thoughtsTokenCount ?? 0;
  const thoughtHint =
    thoughts > 0
      ? ` Thinking consumed ${thoughts} token(s) before any output was produced.`
      : "";

  if (candidates.length === 0) {
    const feedback = data?.promptFeedback
      ? ` promptFeedback=${JSON.stringify(data.promptFeedback)}`
      : "";
    return (
      `${GEMINI_EMPTY_RESPONSE_ERROR} candidates=[] with no model text.${feedback}` +
      `${thoughtHint} Retry with a different model or switch provider.`
    );
  }

  const finishReason = candidates[0]?.finishReason ?? null;
  const partsText = candidateText(candidates[0]);

  if (!partsText) {
    if (finishReason === "MAX_TOKENS") {
      return (
        `${GEMINI_EMPTY_RESPONSE_ERROR} finishReason=MAX_TOKENS but no text was returned.` +
        `${thoughtHint} Increase maxOutputTokens or use a model without thinking overhead. Retry or switch provider.`
      );
    }
    return (
      `${GEMINI_EMPTY_RESPONSE_ERROR} Candidate had no text parts` +
      (finishReason ? ` (finishReason=${finishReason}).` : ".") +
      `${thoughtHint} Retry or switch provider.`
    );
  }

  return null;
}
