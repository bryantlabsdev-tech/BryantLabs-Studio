import type { FileWriteMode } from "../providers/settings.cjs";
import {
  FOLDER_NOT_EMPTY_CODE,
  folderNotEmptyErrorMessage,
} from "./folderPaths.cjs";
import type { GeneratedFile } from "./generate.cjs";
import {
  isEmptyDirectory,
  writeGreenfieldFiles,
  type GreenfieldWriteOptions,
  type GreenfieldWriteResult,
  type WriteFileLogEntry,
} from "./write.cjs";
import {
  isProviderScopeCancelled,
  PROVIDER_USER_CANCEL_MESSAGE,
  runInProviderRequestScope,
} from "../providers/providerRequestRegistry.cjs";

export type GreenfieldWriteIpcResult =
  | { ok: true; written: string[]; logs: WriteFileLogEntry[] }
  | {
      ok: false;
      written: string[];
      errors: string[];
      logs: WriteFileLogEntry[];
    }
  | { error: string; code?: typeof FOLDER_NOT_EMPTY_CODE };

/**
 * IPC adapter for greenfield writes. Rollback lives only in writeGreenfieldFiles.
 */
export async function handleGreenfieldWriteIpc(input: {
  readonly approvedRoot: string;
  readonly files: GeneratedFile[];
  readonly generationId?: string;
  readonly writeMode: FileWriteMode;
  readonly writeOptions?: GreenfieldWriteOptions;
}): Promise<GreenfieldWriteIpcResult> {
  const { approvedRoot, writeMode } = input;
  const scope =
    typeof input.generationId === "string" && input.generationId
      ? input.generationId
      : undefined;
  if (writeMode === "safe" && !(await isEmptyDirectory(approvedRoot))) {
    const message = folderNotEmptyErrorMessage();
    console.warn(`[greenfield:write] blocked — ${message} path=${approvedRoot}`);
    return {
      error: message,
      code: FOLDER_NOT_EMPTY_CODE,
    };
  }

  const result: GreenfieldWriteResult = await runInProviderRequestScope(
    scope,
    () =>
      writeGreenfieldFiles(approvedRoot, Array.isArray(input.files) ? input.files : [], {
        mode: writeMode,
        ...(scope ? { generationId: scope } : {}),
        ...(input.writeOptions?.io ? { io: input.writeOptions.io } : {}),
      }),
  );

  if (result.ok) {
    return { ok: true, written: result.written, logs: result.logs };
  }

  const cancelled = Boolean(scope && isProviderScopeCancelled(scope));
  const errors =
    result.errors.length > 0
      ? result.errors
      : cancelled
        ? [PROVIDER_USER_CANCEL_MESSAGE]
        : result.errors;
  return {
    ok: false,
    written: result.written,
    errors,
    logs: result.logs,
  };
}
