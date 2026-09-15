// Express-сервер мок-API: плоское дерево /api/org-tree и SSE-поток патчей /api/events.

import cors from 'cors';
import express from 'express';
import { startMutationLoop } from './mutations';
import { buildOrgTree } from './org-data';
import { createSseHub, formatPatchEvent, HEARTBEAT_CHUNK } from './sse';

const PORT = Number(process.env.PORT ?? 4000);
// CORS для dev-клиента; список origin'ов через запятую в CORS_ORIGIN.
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',');
const HEARTBEAT_INTERVAL_MS = 15_000;

const nodes = buildOrgTree();
const hub = createSseHub();

const app = express();
app.use(cors({ origin: CORS_ORIGINS }));

app.get('/api/org-tree', (_req, res) => {
  res.json(nodes);
});

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // proxy_buffering off для nginx-прокси
  });
  res.flushHeaders();

  const unsubscribe = hub.add({ write: (chunk) => res.write(chunk) });
  // Ответ может быть уничтожен, пока broadcast ещё пишет в него
  // (ERR_STREAM_DESTROYED): ошибка потока просто отписывает клиента.
  res.on('error', unsubscribe);
  req.on('close', unsubscribe);
});

const stopMutations = startMutationLoop({
  nodes,
  onPatch: (patch) => hub.broadcast(formatPatchEvent(patch)),
});

const heartbeat = setInterval(() => hub.broadcast(HEARTBEAT_CHUNK), HEARTBEAT_INTERVAL_MS);

const server = app.listen(PORT, () => {
  // oxlint-disable-next-line no-console -- баннер старта мок-API идёт в stdout; warn/error исказили бы семантику
  console.log(`[api] mock org-tree API on http://localhost:${PORT}`);
});

server.on('close', () => {
  clearInterval(heartbeat);
  stopMutations();
});
