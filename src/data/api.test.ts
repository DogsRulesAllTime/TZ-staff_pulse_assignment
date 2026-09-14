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

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOrgTree', () => {
  it('fetches /api/org-tree with an abort signal and returns parsed nodes', async () => {
    const fetchMock = stubFetch(async () =>
      Response.json([validNode, { ...validNode, id: 'node-2' }]),
    );

    const tree = await fetchOrgTree();

    expect(tree).toHaveLength(2);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/org-tree', {
      signal: expect.any(AbortSignal),
    });
  });

  it('returns an empty array for a valid empty response', async () => {
    stubFetch(async () => Response.json([]));
    await expect(fetchOrgTree()).resolves.toEqual([]);
  });

  it('maps an HTTP error status to ApiError kind "http" with status', async () => {
    stubFetch(async () => new Response('boom', { status: 500 }));

    const error = await fetchOrgTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).status).toBe(500);
  });

  it('maps an invalid JSON body to ApiError kind "invalid_payload"', async () => {
    stubFetch(async () => new Response('not json'));

    const error = await fetchOrgTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('invalid_payload');
  });

  it('maps a schema-invalid payload to ApiError kind "invalid_payload" with issue summary', async () => {
    stubFetch(async () => Response.json([{ ...validNode, performance: 150 }]));

    const error = await fetchOrgTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('invalid_payload');
    expect((error as ApiError).message).toContain('performance');
  });

  it('maps a network failure to ApiError kind "network"', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const error = await fetchOrgTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
  });
});
