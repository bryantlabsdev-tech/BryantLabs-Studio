import { normalizePreviewUrl } from "@/core/preview/normalizePreviewUrl";

export const GENERATED_APP_UI_AUDIT_LABEL = "Generated App UI Audit";
export const STUDIO_UI_AUDIT_LABEL = "Studio UI Audit";

export interface PreviewAuditUrlValidation {
  readonly ok: boolean;
  readonly normalizedUrl?: string;
  readonly reason?: string;
}

/** UI audit must load the generated app preview host, not the Studio shell. */
export function validateGeneratedAppPreviewAuditUrl(
  rawUrl: string | null | undefined,
): PreviewAuditUrlValidation {
  const trimmed = rawUrl?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, reason: "No preview URL available for Generated App UI Audit." };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false,
        reason: "Generated App UI Audit requires an http(s) preview URL, not the Studio shell.",
      };
    }

    const host = parsed.hostname.toLowerCase();
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    if (!isLocal) {
      return {
        ok: false,
        reason: "Generated App UI Audit only runs against the local generated-app preview server.",
      };
    }

    return { ok: true, normalizedUrl: normalizePreviewUrl(trimmed) };
  } catch {
    return { ok: false, reason: "Invalid preview URL for Generated App UI Audit." };
  }
}
