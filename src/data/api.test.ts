// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchOrgTree } from './api';

const validNode = {
  id: 'node-1',
  name: 'Engineering',
  parentId: null,
  headcount: 12,
  budget: 1500,
  performance: 74.5,
  updatedAt: '2026-02-11T10:00:00.000Z',
};

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;

function stubFetch(impl: FetchImpl) {
  const fetchMock = vi.fn<FetchImpl>(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOrgTree', () => {
  it('fetches /api/org-tree with an abort signal and returns parsed nodes', async () => {
    const fetchMock = stubFetch(() => Response.json([validNode, { ...validNode, id: 'node-2' }]));

    const tree = await fetchOrgTree();

    expect(tree).toHaveLength(2);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/org-tree', {
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('returns an empty array for a valid empty response', async () => {
    stubFetch(() => Response.json([]));
    await expect(fetchOrgTree()).resolves.toEqual([]);
  });

  it('maps an HTTP error status to ApiError kind "http" with status', async () => {
    stubFetch(() => Promise.resolve(new Response('boom', { status: 500 })));

    const error = await fetchOrgTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).status).toBe(500);
  });

  it('maps an invalid JSON body to ApiError kind "invalid_payload"', async () => {
    stubFetch(() => Promise.resolve(new Response('not json')));

    const error = await fetchOrgTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('invalid_payload');
  });

  it('maps a schema-invalid payload to ApiError kind "invalid_payload" with issue summary', async () => {
    stubFetch(() => Response.json([{ ...validNode, performance: 150 }]));

    const error = await fetchOrgTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('invalid_payload');
    expect((error as ApiError).message).toContain('performance');
  });

  it('maps a network failure to ApiError kind "network"', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const error = await fetchOrgTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
  });

  it('passes an external signal through: combined with the timeout, normal path unaffected', async () => {
    const controller = new AbortController();
    const fetchMock = stubFetch(() => Response.json([validNode]));

    await expect(fetchOrgTree(controller.signal)).resolves.toEqual([validNode]);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestSignal = init.signal as AbortSignal;
    // Комбинированный сигнал — не переданный (AbortSignal.any), но реагирует на его отмену.
    expect(requestSignal).not.toBe(controller.signal);
    expect(requestSignal.aborted).toBe(false);
    controller.abort();
    expect(requestSignal.aborted).toBe(true);
  });

  it('maps an aborted external signal to ApiError kind "aborted"', async () => {
    const controller = new AbortController();
    controller.abort();
    stubFetch((_url, init) => {
      // Поведение fetch при отменённом сигнале: мгновенное отклонение AbortError.
      if ((init?.signal as AbortSignal | undefined)?.aborted) {
        return Promise.reject(new DOMException('This operation was aborted', 'AbortError'));
      }
      return Promise.resolve(Response.json([]));
    });

    const error = await fetchOrgTree(controller.signal).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('aborted');
  });

  it('keeps kind "network" when the 10s timeout fired (TimeoutError, external signal not aborted)', async () => {
    stubFetch(() =>
      Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    );

    const error = await fetchOrgTree().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
  });
});
