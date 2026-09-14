import { orgTreeSchema, type OrgNode } from './schema'

/** Distinguishable failure kinds so the UI can map them to error states. */
export type ApiErrorKind = 'network' | 'http' | 'invalid_payload'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number

  constructor(kind: ApiErrorKind, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'ApiError'
    this.kind = kind
    if (options?.status !== undefined) {
      this.status = options.status
    }
  }
}

const REQUEST_TIMEOUT_MS = 10_000

/** GET /api/org-tree — throws ApiError on network failure, HTTP error status or invalid payload. */
export async function fetchOrgTree(): Promise<OrgNode[]> {
  let response: Response
  try {
    response = await fetch('/api/org-tree', {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new ApiError('network', 'Failed to fetch /api/org-tree', { cause })
  }

  if (!response.ok) {
    throw new ApiError('http', `GET /api/org-tree responded with ${response.status}`, {
      status: response.status,
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    throw new ApiError('invalid_payload', 'GET /api/org-tree returned invalid JSON', { cause })
  }

  const parsed = orgTreeSchema.safeParse(payload)
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new ApiError('invalid_payload', `Invalid /api/org-tree payload — ${summary}`, {
      cause: parsed.error,
    })
  }

  return parsed.data
}
