import { orgTreeSchema, type OrgNode } from './schema';

/** Distinguishable failure kinds so the UI can map them to error states. */
export type ApiErrorKind = 'network' | 'http' | 'invalid_payload' | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'ApiError';
    this.kind = kind;
    if (options?.status !== undefined) {
      this.status = options.status;
    }
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * GET /api/org-tree — throws ApiError on network failure, HTTP error status or invalid payload.
 *
 * @param signal — external cancellation signal (TanStack Query passes its own on unmount /
 * competing refetch). Combined with the 10s timeout via `AbortSignal.any` (Node 22+ / modern
 * browsers). Abort mapped to a distinct kind 'aborted' so cancellation stays distinguishable
 * from a network failure; the timeout itself keeps kind 'network'. TanStack Query swallows
 * rejections of silently-cancelled queries (query-core retryer), so no error-state flash.
 */
export async function fetchOrgTree(signal?: AbortSignal): Promise<OrgNode[]> {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch('/api/org-tree', { signal: requestSignal });
  } catch (cause) {
    if (signal?.aborted) {
      throw new ApiError('aborted', 'GET /api/org-tree was aborted', { cause });
    }
    throw new ApiError('network', 'Failed to fetch /api/org-tree', { cause });
  }

  if (!response.ok) {
    throw new ApiError('http', `GET /api/org-tree responded with ${response.status}`, {
      status: response.status,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError('invalid_payload', 'GET /api/org-tree returned invalid JSON', { cause });
  }

  const parsed = orgTreeSchema.safeParse(payload);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ApiError('invalid_payload', `Invalid /api/org-tree payload — ${summary}`, {
      cause: parsed.error,
    });
  }

  return parsed.data;
}
