// Транспорт SSE: формат сообщений + реестр подписчиков. Без Express.

import type { Patch } from './mutations'

export interface SseClient {
  write: (chunk: string) => void
}

export const HEARTBEAT_CHUNK = ': ping\n\n'

/** Кадр `event: patch` с JSON-payload — формат контракта с клиентом. */
export function formatPatchEvent(patch: Patch): string {
  return `event: patch\ndata: ${JSON.stringify(patch)}\n\n`
}

export interface SseHub {
  add: (client: SseClient) => () => void
  broadcast: (chunk: string) => void
  readonly size: number
}

/** Реестр подписчиков: add возвращает функцию отписки. */
export function createSseHub(): SseHub {
  const clients = new Set<SseClient>()
  return {
    add(client) {
      clients.add(client)
      return () => clients.delete(client)
    },
    broadcast(chunk) {
      for (const client of clients) client.write(chunk)
    },
    get size() {
      return clients.size
    },
  }
}
