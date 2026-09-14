# Архитектура

## Обзор

Приложение состоит из двух процессов: mock-сервера (Express, порт 4000) и SPA-клиента
(Vite, порт 5173 в dev; статика через Nginx в prod). Взаимодействие — REST `GET /api/org-tree`
для первичной загрузки и SSE `GET /api/events` для live-патчей.

## Слои клиента (снизу вверх)

```
┌────────────────────────────────────────────────────────────┐
│  UI            components/  (OrgTree, MetricsTable, ...)   │  ← styled-components, без бизнес-логики
├────────────────────────────────────────────────────────────┤
│  Features      features/    (useOrgData, useSsePatches,    │  ← оркестрация: хуки, связка
│                 useTableSort, useAiSearch)                 │     серверного и UI-состояния
├────────────────────────────────────────────────────────────┤
│  Domain        domain/      (aggregation.ts, tree.ts,      │  ← чистые функции, unit-тесты,
│                 patch.ts, filter.ts, format.ts)            │     не знают про React и сеть
├────────────────────────────────────────────────────────────┤
│  Data          data/        (schema.ts, api.ts, cache.ts,  │  ← zod-валидация, TanStack Query,
│                 sse.ts)                                    │     SSE-подписка
└────────────────────────────────────────────────────────────┘
```

Правила зависимостей: слой N импортирует только слои N−1 и ниже. `domain/` не импортирует
React,styled-components, TanStack Query — поэтому агрегация и патчи тестируются чистым Vitest.

## Поток данных

### Первичная загрузка

```
OrgDashboard (mount)
  → useOrgData → cache.fetchOrgTree()
      → TanStack Query ['org-tree'], staleTime 5000
          → api.fetchOrgTree() : fetch GET /api/org-tree
              → schema.orgTreeSchema.parse(raw)   // zod; невалидный ответ → QueryError → ErrorState
  → buildTree(nodes) + aggregate(nodes)            // однопроходный post-order DFS
  → <OrgTree/> / <MetricsTable/>                   // режим выбирает ViewToggle
```

- Дедупликация: параллельные мониторы с одним ключом → один сетевой запрос.
- `staleTime 5s`: в течение 5с кэш считается свежим, ремоунт/фокус → без запроса.
- Инвалидация вручную только по реальному изменению данных (SSE-патч), не по таймеру.

### Live-обновление (SSE)

```
useSsePatches
  → new EventSource('/api/events')
      → event 'patch': patchSchema.parse(JSON.parse(e.data))
          → queryClient.setQueryData(['org-tree'], applyPatch)   // без рефетча
              → patchPropagation: пересчёт агрегатов затронутого узла + предков
          → affected cell ids → <MetricsTable/> fade-out 1.5s
Обрыв → backoff: 1s, 2s, 4s … max 16s (± jitter 30%) → ConnectionBadge: online|connecting|offline
```

## Состояния UI

| Состояние | Источник                                 | Отображение                                      |
| --------- | ---------------------------------------- | ------------------------------------------------ |
| Loading   | `query.isPending`                        | скелетон дерева/таблицы                          |
| Error     | `query.isError` (сеть, невалидная схема) | сообщение + кнопка «Повторить» (`query.refetch`) |
| Empty     | валидный, но пустой массив               | «Нет данных»                                     |
| Offline   | SSE-статус                               | бейдж в шапке, данные остаются (last known good) |

## Сервер

- `GET /api/org-tree` — плоский массив узлов `{ id, name, parentId, headcount, budget, performance, updatedAt }`, ≥ 40 узлов, ≥ 3 уровней, `parentId: null` у корней.
- `GET /api/events` — SSE-стрим; каждые 2–6с мутирует случайный узел и шлёт `event: patch` c `{ id, changes, updatedAt }`.
- Один источник данных в памяти: чтение и стрим читают одно и то же состояние → патчи консистентны.

## Карта файлов клиента

```
src/
  data/        schema.ts  api.ts  cache.ts  sse.ts
  domain/      tree.ts  aggregation.ts  patch.ts  filter.ts  format.ts  search.ts
  features/    useOrgData.ts  useSsePatches.ts  useTableSort.ts  useDebouncedValue.ts  ui-state.tsx
  components/  OrgDashboard.tsx  OrgTree/  MetricsTable/  shared/  (states, ViewToggle, ConnectionBadge, AiSearchBar)
  app/         App.tsx  theme.ts  router (не нужен — одноэкранное приложение)
  test/        setup.ts  factories.ts
```
