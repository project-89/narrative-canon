/**
 * The browser/server contract for project asset uploads.
 *
 * Keep this in one place: both the Asset Library and Style Studio accept the
 * same selections, and both must stay below the server's per-request memory
 * boundary. A user selection is validated in full before the first byte is
 * sent, then uploaded in small sequential batches so a large drop cannot turn
 * into one oversized multipart request.
 */

export const ASSET_UPLOAD_MAX_FILES = 30;
export const ASSET_UPLOAD_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const ASSET_UPLOAD_BATCH_SIZE = 4;

export type AssetUploadErrorKind = "validation" | "request";

export interface AssetUploadProgress<TAsset> {
  assets: TAsset[];
  styleAssetIds: string[];
  completedFileCount: number;
  selectedFileCount: number;
  completedBatchCount: number;
  totalBatchCount: number;
}

export class AssetUploadError<TAsset = unknown> extends Error {
  readonly kind: AssetUploadErrorKind;
  readonly progress: AssetUploadProgress<TAsset>;
  readonly failedBatchNumber?: number;
  readonly status?: number;

  constructor(
    message: string,
    options: {
      kind: AssetUploadErrorKind;
      progress: AssetUploadProgress<TAsset>;
      failedBatchNumber?: number;
      status?: number;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AssetUploadError";
    this.kind = options.kind;
    this.progress = options.progress;
    this.failedBatchNumber = options.failedBatchNumber;
    this.status = options.status;
  }
}

interface UploadAssetBatchesOptions<TAsset> {
  files: FileList | File[];
  projectId: string;
  category: string;
  endpoint: string;
  fetcher?: typeof fetch;
  onBatchComplete?: (progress: AssetUploadProgress<TAsset>) => void;
}

interface ParsedResponse {
  payload: Record<string, unknown> | null;
  text: string;
}

const emptyProgress = <TAsset>(selectedFileCount: number): AssetUploadProgress<TAsset> => ({
  assets: [],
  styleAssetIds: [],
  completedFileCount: 0,
  selectedFileCount,
  completedBatchCount: 0,
  totalBatchCount: selectedFileCount > 0
    ? Math.ceil(selectedFileCount / ASSET_UPLOAD_BATCH_SIZE)
    : 0,
});

const cloneProgress = <TAsset>(progress: AssetUploadProgress<TAsset>): AssetUploadProgress<TAsset> => ({
  ...progress,
  assets: [...progress.assets],
  styleAssetIds: [...progress.styleAssetIds],
});

const responseBody = async (response: Response): Promise<ParsedResponse> => {
  const text = await response.text();
  if (!text.trim()) return { payload: null, text };
  try {
    const parsed: unknown = JSON.parse(text);
    return {
      payload: parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null,
      text,
    };
  } catch {
    // Multipart limit failures can be rendered as an HTML error page by a
    // proxy/framework. Never call response.json() blindly or leak that markup
    // into the studio; the HTTP status below remains useful and truthful.
    return { payload: null, text };
  }
};

const serverErrorMessage = (response: Response, body: ParsedResponse): string => {
  const structured = body.payload?.error ?? body.payload?.message;
  if (typeof structured === "string" && structured.trim()) return structured.trim();

  const plain = body.text.trim();
  if (plain && !plain.startsWith("<") && plain.length <= 240) return plain;

  const statusLabel = response.statusText.trim();
  return statusLabel
    ? `Upload request was rejected (${response.status} ${statusLabel})`
    : `Upload request was rejected (${response.status})`;
};

const unknownErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The upload request could not be completed";
};

/** Validate the complete selection before any request is sent. */
export function validateAssetUploadSelection<TAsset = unknown>(
  files: FileList | File[],
  projectId: string,
): File[] {
  const selected = Array.from(files);
  const progress = emptyProgress<TAsset>(selected.length);

  if (!projectId.trim()) {
    throw new AssetUploadError<TAsset>("Choose a project before uploading images.", {
      kind: "validation",
      progress,
    });
  }
  if (selected.length === 0) {
    throw new AssetUploadError<TAsset>("Choose at least one image to upload.", {
      kind: "validation",
      progress,
    });
  }
  if (selected.length > ASSET_UPLOAD_MAX_FILES) {
    throw new AssetUploadError<TAsset>(
      `Select at most ${ASSET_UPLOAD_MAX_FILES} images at once (${selected.length} selected). Nothing was uploaded.`,
      { kind: "validation", progress },
    );
  }

  const nonImages = selected.filter((file) => !file.type.startsWith("image/"));
  if (nonImages.length > 0) {
    const names = nonImages.slice(0, 3).map((file) => file.name).join(", ");
    const remainder = nonImages.length > 3 ? ` and ${nonImages.length - 3} more` : "";
    throw new AssetUploadError<TAsset>(
      `Only image files can be uploaded. Remove ${names}${remainder}. Nothing was uploaded.`,
      { kind: "validation", progress },
    );
  }

  const oversized = selected.filter((file) => file.size > ASSET_UPLOAD_MAX_FILE_BYTES);
  if (oversized.length > 0) {
    const names = oversized.slice(0, 3).map((file) => file.name).join(", ");
    const remainder = oversized.length > 3 ? ` and ${oversized.length - 3} more` : "";
    throw new AssetUploadError<TAsset>(
      `Each image must be 50 MiB or smaller. Remove or resize ${names}${remainder}. Nothing was uploaded.`,
      { kind: "validation", progress },
    );
  }

  return selected;
}

/**
 * Upload a validated selection in sequential four-file multipart requests.
 * Every request carries its own projectId; no batch relies on mutable active
 * project state. If a later batch fails, the thrown error carries all assets
 * and style pins confirmed by prior batches so callers can report/refetch.
 */
export async function uploadAssetBatches<TAsset = Record<string, unknown>>(
  options: UploadAssetBatchesOptions<TAsset>,
): Promise<AssetUploadProgress<TAsset>> {
  const files = validateAssetUploadSelection<TAsset>(options.files, options.projectId);
  const progress = emptyProgress<TAsset>(files.length);
  const styleAssetIds = new Set<string>();
  const fetcher = options.fetcher ?? fetch;

  for (let offset = 0; offset < files.length; offset += ASSET_UPLOAD_BATCH_SIZE) {
    const batch = files.slice(offset, offset + ASSET_UPLOAD_BATCH_SIZE);
    const batchNumber = Math.floor(offset / ASSET_UPLOAD_BATCH_SIZE) + 1;
    const form = new FormData();
    for (const file of batch) form.append("files", file);
    form.append("projectId", options.projectId);
    form.append("category", options.category);

    try {
      const response = await fetcher(options.endpoint, { method: "POST", body: form });
      const body = await responseBody(response);
      if (!response.ok) {
        throw new AssetUploadError<TAsset>(serverErrorMessage(response, body), {
          kind: "request",
          progress: cloneProgress(progress),
          failedBatchNumber: batchNumber,
          status: response.status,
        });
      }
      if (!body.payload) {
        throw new AssetUploadError<TAsset>("Upload completed, but the server response could not be read.", {
          kind: "request",
          progress: cloneProgress(progress),
          failedBatchNumber: batchNumber,
          status: response.status,
        });
      }

      const assets = Array.isArray(body.payload.assets)
        ? body.payload.assets as TAsset[]
        : [];
      progress.assets.push(...assets);
      if (Array.isArray(body.payload.styleAssetIds)) {
        for (const id of body.payload.styleAssetIds) {
          if (typeof id === "string") styleAssetIds.add(id);
        }
      }
      progress.styleAssetIds = [...styleAssetIds];
      progress.completedFileCount += batch.length;
      progress.completedBatchCount += 1;
      options.onBatchComplete?.(cloneProgress(progress));
    } catch (error) {
      if (error instanceof AssetUploadError) throw error;
      throw new AssetUploadError<TAsset>(unknownErrorMessage(error), {
        kind: "request",
        progress: cloneProgress(progress),
        failedBatchNumber: batchNumber,
        cause: error,
      });
    }
  }

  return cloneProgress(progress);
}

/** User-facing copy that makes partial persistence explicit. */
export function assetUploadErrorNotice(error: unknown): string {
  if (!(error instanceof AssetUploadError)) {
    return `Upload failed: ${unknownErrorMessage(error)}`;
  }
  if (error.kind === "validation") return error.message;

  const { completedFileCount, selectedFileCount } = error.progress;
  if (completedFileCount > 0) {
    return `${completedFileCount} of ${selectedFileCount} images uploaded before batch ${error.failedBatchNumber ?? "?"} failed. Those images remain saved and the library was refreshed. ${error.message}`;
  }
  return `Upload failed before any images were confirmed. The library was refreshed in case the server saved the interrupted batch. ${error.message}`;
}
