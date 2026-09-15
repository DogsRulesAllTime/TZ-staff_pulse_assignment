import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ORG_TREE_KEY } from '@/data/cache';
import { applyPatch } from '@/domain/patch';
import type { OrgNode } from '@/data/schema';
import { connectSse, type SseStatus } from '@/data/sse';

export type { SseStatus } from '@/data/sse';

/**
 * Последний применённый патч и «шов» для Task 8 (fade-out в таблице):
 * `seq` монотонно растёт при каждом патче, чтобы потребитель мог отличить
 * новый патч по тому же узлу от уже показанного; `affectedIds` — id узлов,
 * чьи данные изменились в кеше (сейчас один id, поле — массив на будущее).
 */
export interface AppliedPatch {
  seq: number;
  id: string;
  affectedIds: string[];
  updatedAt: string;
}

export interface SsePatches {
  status: SseStatus;
  lastPatch: AppliedPatch | null;
}

/**
 * Подписка на SSE-патчи `/api/events` поверх TanStack Query:
 * валидный патч применяется к кешу ORG_TREE_KEY через setQueryData +
 * applyPatch (без refetch); status — для ConnectionBadge, lastPatch —
 * для fade-out (Task 8). Cleanup: close() закрывает EventSource и
 * снимает отложенный reconnect-таймер при размонтировании.
 */
export function useSsePatches(): SsePatches {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SseStatus>('connecting');
  const [lastPatch, setLastPatch] = useState<AppliedPatch | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const connection = connectSse({
      url: '/api/events',
      onStatus: setStatus,
      onPatch: (patch) => {
        // Нет данных в кеше — применять не к чему; refetch не триггерим.
        queryClient.setQueryData<OrgNode[]>(ORG_TREE_KEY, (nodes) =>
          nodes === undefined ? nodes : applyPatch(nodes, patch),
        );
        seqRef.current += 1;
        setLastPatch({
          seq: seqRef.current,
          id: patch.id,
          affectedIds: [patch.id],
          updatedAt: patch.updatedAt,
        });
      },
    });
    return () => connection.close();
  }, [queryClient]);

  return { status, lastPatch };
}
