# Staff Pulse Dashboard — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** дашборд мониторинга орг-структуры: интерактивное дерево + аналитическая таблица агрегатов + live-обновления, 4 этапа задания как коммиты с тегами `step/1..4`.

**Architecture:** два процесса (Express mock-сервер :4000, Vite SPA :5173); клиент слоится data → domain → features → components; серверное состояние в TanStack Query, UI — Context; live — SSE-патчи c инкрементальной агрегацией.

**Tech Stack:** React 18, Vite 5, TypeScript strict, styled-components v6, TanStack Query v5, zod, Express, Vitest + Testing Library, Docker + Nginx.

**Spec:** `staff_pulse_assignment.pdf` (условия — необходимый минимум); дизайн-решения — `docs/architecture.md`, `docs/data-model.md`, `docs/adr/*`.

## Global Constraints

- Требования задания — необходимый минимум; каждый пункт задания должен быть закрыт задачей плана.
- Каждый этап завершается тегом `step/N` на последнем коммите этапа (внутри этапа коммитов может быть несколько).
- Коммиты — Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.
- Никаких UI-библиотек (MUI/Ant), авторизации, БД, inline-CSS.
- `staleTime: 5000` — точно; дебаунс фильтра — 250мс — точно; fade-out ~1.5с; backoff 1→16с.
- Агрегаты: totalHeadcount, totalBudget = узел + потомки; weightedPerformance = Σ(perf·headcount)/Σheadcount.
- Бюджет: `12 345 678 руб.` (Intl.NumberFormat('ru-RU')).
- Бандл prod ≤ 200 КБ gzip — проверяется `pnpm check:size`.
- TDD для domain/ и data/ слоёв; UI — smoke-тесты ключевых состояний.
- `prefers-reduced-motion` уважается во всех анимациях.
- Абсолютные импорты через алиас `@/` → `src/`.
- ≥ 40 узлов, ≥ 3 уровней в mock-данных.
- После каждого коммита — запись в `docs/PROGRESS.md`.
- Код проходит `pnpm lint` (ESLint 9 flat + typescript-eslint) и `pnpm format:check` (Prettier) — 0 ошибок/0 предупреждений; pre-commit hook (husky + lint-staged) прогоняет их на staged-файлах.

---

## Этап 01 — FOUNDATION (тег `step/1`)

### Task 1: Scaffold и инфраструктура

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `.gitignore`, `.env.example`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/app/theme.ts`
- Create: `vitest.config.ts`, `src/test/setup.ts`
- Create: `server/index.ts`, `server/package.json` (сервер — отдельный package с `tsx` для dev)

**Interfaces:**
- Produces: алиас `@/` → `src/`; тему styled-components (тип `Theme` экспортируется из `@/app/theme`); точки входа `pnpm dev` (concurrently: клиент+сервер), `pnpm test`.

- [x] **Step 1:** `pnpm create vite@latest . --template react-ts` внутри репозитория (плоско, не в подпапке клиента), затем добавить зависимости: `pnpm add @tanstack/react-query zod styled-components @types/styled-components` и dev: `vitest @testing-library/react @testing-library/jest-dom jsdom express cors tsx concurrently`.
- [x] **Step 2:** настроить `vite.config.ts`: `resolve.alias['@'] = path.resolve(__dirname, 'src')`, `server.proxy['/api'] = 'http://localhost:4000'`; `tsconfig.json`: `"paths": {"@/*": ["./src/*"]}`, `strict: true`.
- [x] **Step 3:** `src/app/theme.ts` — токены: `colors.performance = { good: '#2e9e5b', mid: '#e0a800', bad: '#d64545' }`, `colors.status = { online, connecting, offline }`, `radii`, `spacing`, `motion: '(prefers-reduced-motion: reduce)'`. Экспортировать `Theme` и `theme`.
- [x] **Step 4:** `src/main.tsx` — `<QueryClientProvider><ThemeProvider theme={theme}><App/></ThemeProvider></QueryClientProvider>`; `QueryClient` c `defaultOptions.queries.staleTime = 5000`.
- [x] **Step 5:** smoke-тест `src/app/App.test.tsx`: рендерится заголовок «Staff Pulse». `pnpm test` → PASS.
- [x] **Step 6:** Commit: `git commit -m "chore: scaffold vite+react+ts app with theme, query client and vitest"`.

### Task 2: Mock-сервер

**Files:**
- Create: `server/index.ts`, `server/org-data.ts`, `server/mutations.ts`, `server/sse.ts`
- Test: `server/org-data.test.ts`

**Interfaces:**
- Produces: `GET /api/org-tree` → `OrgNode[]` (≥40 узлов, 3 уровня: 4 дивизиона → 2–3 отдела → 2–3 команды); `GET /api/events` → SSE `event: patch` c payload `{ id, changes, updatedAt }`.

- [x] **Step 1:** тест-фабрика данных: `buildOrgTree()` возвращает ≥40 узлов; тест проверяет: `nodes.length >= 40`, `depths.max >= 2`, `parentId` ссылается только на существующие id, корней ≥ 1. Запустить: `pnpm vitest run server/org-data.test.ts` → FAIL.
- [x] **Step 2:** реализовать `server/org-data.ts` — детерминированный генератор (seeded PRNG, чтобы данные стабильны между перезапусками): 4 дивизиона, у каждого 2–3 отдела, у отдела 2–3 команды; headcount 3–60, budget 100_000–50_000_000, performance 10–99.
- [x] **Step 3:** `server/index.ts` — Express: `GET /api/org-tree` (CORS для :5173), `GET /api/events` (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `proxy_buffering` off); `server/mutations.ts` — интервал 2–6с: выбрать случайный узел, мутировать 1–2 поля (headcount ±1–3, budget ±, performance ±10 c clamp 0..100), разослать `event: patch` всем подписчикам; heartbeat-комментарий `: ping` каждые 15с.
- [x] **Step 4:** `pnpm vitest run server/org-data.test.ts` → PASS. Ручная проверка: `curl -N localhost:4000/api/events` — патчи приходят.
- [x] **Step 5:** Commit: `git commit -m "feat(server): mock org-tree API with SSE patch stream"`.

### Task 3: Слой data — схема, API, кэш

**Files:**
- Create: `src/data/schema.ts`, `src/data/api.ts`, `src/data/cache.ts`
- Test: `src/data/schema.test.ts`

**Interfaces:**
- Produces: тип `OrgNode` (из zod-схемы `z.infer`); `fetchOrgTree(): Promise<OrgNode[]>` (бросает `ApiError` на невалидный ответ); `QueryClient` с ключом `['org-tree']`.

- [x] **Step 1:** тест схемы (сначала): валидный узел проходит; невалидный (performance 150, отрицательный headcount, отсутствует name) — reject; пустой массив — валиден; невалидный parentId-референс на уровне forest-валидации (`validateForest`) — reject. Запустить → FAIL.
- [x] **Step 2:** `src/data/schema.ts`:

```ts
import { z } from 'zod';
export const orgNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().nullable(),
  headcount: z.number().int().positive(),
  budget: z.number().int().nonnegative(),
  performance: z.number().min(0).max(100),
  updatedAt: z.string().datetime(),
});
export const orgTreeSchema = z.array(orgNodeSchema);
export type OrgNode = z.infer<typeof orgNodeSchema>;
```

- [x] **Step 3:** `src/data/api.ts` — `fetch` c `AbortSignal.timeout(10_000)`, `res.ok`-проверка, `orgTreeSchema.parse(await res.json())`; ошибка parse/network → `ApiError` (единый тип для Error-состояния).
- [x] **Step 4:** `src/data/cache.ts` — экспорт `ORG_TREE_KEY = ['org-tree'] as const` и хелперов `useOrgTreeQuery()` над `useQuery({ queryKey, queryFn: fetchOrgTree })`. `staleTime: 5000` уже в дефолтах клиента.
- [x] **Step 5:** тесты PASS; Commit: `git commit -m "feat(data): zod-validated org-tree API layer with query cache"`.

### Task 4: Дерево + состояния

**Files:**
- Create: `src/domain/tree.ts`, `src/features/useOrgData.ts`, `src/components/OrgDashboard.tsx`, `src/components/OrgTree/OrgTree.tsx`, `src/components/OrgTree/OrgNodeRow.tsx`, `src/components/shared/States.tsx`, `src/components/shared/PerformanceDot.tsx`
- Test: `src/domain/tree.test.ts`, `src/components/OrgTree/OrgTree.test.tsx`

**Interfaces:**
- Consumes: `useOrgTreeQuery`, типы `OrgNode`, `Theme`.
- Produces: `buildForest(nodes: OrgNode[]): Forest` (см. data-model.md); `useOrgData(): { forest, aggregates?, status: 'loading'|'error'|'empty'|'ready', refetch }`; `<OrgTree forest expanded onToggle/>`.

- [x] **Step 1:** тест `tree.test.ts`: из 5 узлов (1 корень, 2 отдела, 2 команды) строится Forest; `depth` корректен; parentId на несуществующий узел → бросает `DataError`; цикл → `DataError`. FAIL → реализовать `tree.ts` (Map-проход) → PASS.
- [x] **Step 2:** `useOrgData.ts`: маппинг статуса query на `'loading'|'error'|'empty'|'ready'`; `forest = useMemo(() => buildForest(data), [data])`.
- [x] **Step 3:** `OrgTree`: рекурсивный рендер; раскрытие/скрытие по клику на шеврон; `defaultExpanded`: все узлы `depth <= 1` (второй уровень открыт). Строка узла: имя, `headcount` чел., `<PerformanceDot value/>` (цвет по порогам ≥80 / 50–79 / <50). Анимация раскрытия (height transition) добавляется на этапе 03 — здесь только логика.
- [x] **Step 4:** `OrgDashboard`: status-ветки — `<LoadingSkeleton/>`, `<ErrorState onRetry={refetch}/>` (кнопка «Повторить»), `<EmptyState/>`, иначе `<OrgTree/>`. Никакого inline-CSS — все стили styled-components.
- [x] **Step 5:** тест `OrgTree.test.tsx`: второй уровень виден без клика; клик по шеврону скрывает ветвь; клик снова раскрывает. PASS.
- [x] **Step 6:** Коммит этапа + тег: `git commit -m "feat(tree): interactive org tree with loading/error/empty states"`; `git tag step/1`.

---


> **Статус:** этап 01 завершён (коммиты 78d6a4a..50eb50d, тег `step/1` на 8e1b7e3). См. `docs/PROGRESS.md`.
## Этап 02 — CORE (тег `step/2`)

### Task 5: Агрегация (unit-тест обязателен по заданию)

**Files:**
- Create: `src/domain/aggregation.ts`
- Test: `src/domain/aggregation.test.ts`

**Interfaces:**
- Consumes: `Forest`, `TreeNode`.
- Produces: `aggregateForest(forest): Map<string, Aggregates>`; `recomputeBranch(forest, aggregates, changedIds: string[]): Map<string, Aggregates>` (in-place обновление кэша по ветке до корней); тип `Aggregates { totalHeadcount; totalBudget; weightedPerformance }`.

- [x] **Step 1:** тесты (фикстура: 3 узла — дивизион 10 чел./perf 80, отдел 4 чел./perf 60, команда 6 чел./perf 50):
  - лист: агрегаты = собственные значения;
  - дивизион: `totalHeadcount = 20`, `totalBudget` = сумма всех, `weightedPerformance = (80·10 + 60·4 + 50·6)/20 = 67`;
  - `recomputeBranch` после патча команды 12 чел./perf 70 даёт те же числа, что полный `aggregateForest` заново (инвариант эквивалентности);
  - пустой лес → пустая Map.
  Запустить → FAIL.
- [x] **Step 2:** реализация — один post-order DFS; `weightedPerformance` аккумулируется парой `(headcountWeightedPerfSum, subtreeHeadcount)`; `recomputeBranch` — подъём по `parentOf`. PASS.
- [x] **Step 3:** Commit: `git commit -m "feat(domain): memoized subtree aggregation with branch recompute"`.

### Task 6: Таблица

**Files:**
- Create: `src/features/useTableSort.ts`, `src/features/useDebouncedValue.ts`, `src/domain/filter.ts`, `src/domain/format.ts`, `src/components/MetricsTable/MetricsTable.tsx`, `src/components/ViewToggle.tsx`, `src/features/ui-state.tsx`
- Test: `src/domain/filter.test.ts`, `src/domain/format.test.ts`, `src/features/useTableSort.test.ts`

**Interfaces:**
- Consumes: `useOrgData`, `aggregates`, `TreeNode`, `Aggregates`.
- Produces: `useUiState()` (контекст): `{ view: 'tree'|'table', setView, selectedId, setSelectedId, nameFilter, setNameFilter }`; `useTableSort<T>(rows, initial)` → `{ sorted, sort, toggleSort }` (`sort: {key, dir: 'asc'|'desc'}`); `formatBudget(n): string`; `matchesFilter(nodes, query)`.

- [x] **Step 1:** тесты domain: `formatBudget(12345678) === '12 345 678 руб.'`; `matchesFilter` — case-insensitive substring по поддереву (строка видна, если узел ИЛИ любой потомок подходит); debounce 250мс (fake timers). FAIL → реализация → PASS.
- [x] **Step 2:** тест сортировки: клик по столбцу — asc; повторный клик — без смены; двойной клик — desc; дефолт — по `name` asc.
- [x] **Step 3:** `MetricsTable`: столбцы «Подразделение, Уровень, Всего сотрудников, Бюджет суммарный, Средняя эффективность»; значения агрегатов; строки фильтрованного набора; клик по строке → `setSelectedId` (дерево подсвечивает и раскрывает путь к узлу); `tabular-nums` для чисел.
- [x] **Step 4:** `ViewToggle` + раскладка: `≥1280px` split-view (дерево слева, таблица справа), ниже — переключатель. Медиа-квери через `@media` в styled-components.
- [x] **Step 5:** интеграционный тест: фильтр «команда» → строки сокращаются; клик строки → выделение в дереве (роль/aria-selected).
- [x] **Step 6:** Commit + тег: `git commit -m "feat(table): aggregated metrics table with sort, filter and tree selection"`; `git tag step/2`.

---


> **Статус:** этап 02 завершён (коммиты e0580b8..eeecdc6, тег `step/2`). Агрегация: 16 unit-тестов; таблица: сортировка/фильтр 250мс/связка с деревом/keyboard-reachable строки. См. `docs/PROGRESS.md`.
## Этап 03 — POLISH (тег `step/3`)

### Task 7: SSE-патчи

**Files:**
- Create: `src/data/sse.ts`, `src/domain/patch.ts`
- Modify: `src/features/useOrgData.ts`
- Test: `src/domain/patch.test.ts`, `src/data/sse.test.ts`

**Interfaces:**
- Consumes: `patchSchema` (новый в `schema.ts`), `queryClient`, `recomputeBranch`, `parentOf`.
- Produces: `applyPatch(nodes: OrgNode[], patch: Patch): OrgNode[]` (чистая, структурная замена узла); `useSsePatches(): { status: 'connecting'|'online'|'offline' }`; hook устанавливает `setQueryData(ORG_TREE_KEY, next)` и возвращает затронутые id для fade-out.

- [x] **Step 1:** тесты `patch.test.ts`: валидный патч меняет только перечисленные поля и `updatedAt`; неизвестный id — игнор (массив без изменений); невалидный payload — `parse` rejection. FAIL → реализация → PASS.
- [x] **Step 2:** тесты `sse.test.ts` (mock EventSource): открытие → `online`; обрыв → `offline`, reconnect через 1с, затем 2с, 4с (fake timers), jitter не выводит за [0.7t, 1.3t], max 16с;успешный reconnect → `online` и backoff сбрасывается.
- [x] **Step 3:** `useSsePatches`: подписка через `EventSource('/api/events')`; на `patch` — `queryClient.setQueryData(ORG_TREE_KEY, (nodes) => applyPatch(nodes, parsed))`; MutationObserver-свободно: затронутые id кладутся в атомарный store (`useRef` + состояние) для fade-out в таблице. Cleanup в `useEffect` — закрытие EventSource и таймеров при размонтировании.
- [x] **Step 4:** `<ConnectionBadge status/>` в шапке (цвета из `theme.colors.status`).
- [x] **Step 5:** Commit: `git commit -m "feat(realtime): SSE patches with validated apply and backoff reconnect"`.

### Task 8: Инкрементальная агрегация + fade-out

**Files:**
- Modify: `src/features/useOrgData.ts`, `src/components/MetricsTable/MetricsTable.tsx`
- Test: `src/features/useOrgData.test.tsx`

**Interfaces:**
- Consumes: `recomputeBranch`, `aggregates` Map.
- Produces: агрегаты, пересчитанные только по затронутой ветке; CSS-анимация `fadeOutCell` 1.5с на обновлённых ячейках.

- [x] **Step 1:** тест: применяется патч → `aggregates.get(id)` обновлён, агрегаты детей/соседей не пересчитывались (spy на DFS не вызван повторно — сравнение ссылок в Map для неизменённых узлов).
- [x] **Step 2:** подключение `recomputeBranch` в ветке применения патча; `aggregates` — `useMemo` от forest + версии патча.
- [x] **Step 3:** fade-out: ячейка с обновлённым значением получает `data-changed` на 1.5с (timeout per cell, cleanup при размонтировании); keyframes `opacity 1 → 0.35 → 1`; `prefers-reduced-motion` — без анимации.
- [x] **Step 4:** Commit: `git commit -m "feat(realtime): incremental aggregate recompute with cell fade-out"`.

### Task 9: Keyboard navigation + анимация дерева

**Files:**
- Modify: `src/components/MetricsTable/MetricsTable.tsx`, `src/components/OrgTree/*`
- Test: `src/components/MetricsTable/MetricsTable.test.tsx`

**Interfaces:**
- Consumes: выделение из `ui-state`.
- Produces: таблица с `role="grid"`, фокус-менеджмент строк/ячеек.

- [x] **Step 1:** тесты: ArrowDown/ArrowUp перемещают фокус строки; Home → первая строка, End → последняя; Enter → выбор узла (highlight в дереве). FAIL → реализация → PASS.
- [x] **Step 2:** анимация раскрытия: wrapper с `grid-template-rows: 0fr → 1fr` transition 200мс (или height от measured значения); `@media (prefers-reduced-motion: reduce)` — transition: none.
- [x] **Step 3:** Коммит + тег: `git commit -m "feat(ux): keyboard navigation, tree expand animation, reduced-motion support"`; `git tag step/3`.

---


> **Статус:** этап 03 завершён (коммиты fb00203..bdcf723, тег `step/3`). SSE-патчи без рефетча, fade-out 1.5с, инкрементальная агрегация, backoff 1→16с, keyboard nav, grid-rows анимация с reduced-motion. См. `docs/PROGRESS.md`.
## Этап 04 — BONUS (тег `step/4`)

### Task 10: Качество кода — ESLint 9 (flat) + Prettier + pre-commit

**Files:**
- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.husky/pre-commit`, `.lintstagedrc.json`
- Modify: `package.json` (scripts: `lint`, `lint:fix`, `format`, `format:check`; devDeps)

**Interfaces:**
- Produces: `pnpm lint` (0 warnings policy), `pnpm format:check`; pre-commit hook прогоняет lint-staged (eslint --fix + prettier --write) на staged-файлах.

- [ ] **Step 1:** Установить: `eslint@9`, `typescript-eslint` (плоский конфиг), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-import` (опционально), `prettier`, `husky`, `lint-staged`.
- [ ] **Step 2:** `eslint.config.js` — flat config: typescript-eslint recommended-type-checked для `src/**` и `server/**`, react-hooks/recommended, react-refresh, игнор `dist/`, `node_modules/`, `pnpm-lock.yaml`; правило `@typescript-eslint/no-unused-vars` с `argsIgnorePattern: '^_'`; `no-console: ['warn', { allow: ['warn', 'error'] }]`.
- [ ] **Step 3:** `.prettierrc.json`: `{ "printWidth": 100, "singleQuote": true, "trailingComma": "all", "semi": true }`; `.prettierignore`: dist, pnpm-lock, coverage.
- [ ] **Step 4:** `pnpm format` по всему репо (один механический format-коммит), затем `pnpm lint:fix`; оставшиеся находки (если есть) чинить осмысленно, не подавляя без причины; итог: `pnpm lint` = 0 ошибок, 0 предупреждений.
- [ ] **Step 5:** husky pre-commit + lint-staged: `*.{ts,tsx}` → eslint --fix, prettier --write. Проверить: коммит с нарушением формата должен автопоправляться.
- [ ] **Step 6:** Обновить README (разработка: линт/формат). Commit: `chore(quality): eslint 9 flat config, prettier, husky pre-commit`.


### Task 11: Docker + Nginx + бюджет бандла

**Files:**
- Create: `Dockerfile.client`, `Dockerfile.server`, `docker-compose.yml`, `nginx/default.conf`, `.env.example`, `scripts/check-size.mjs`
- Modify: `package.json` (скрипты)

**Interfaces:**
- Produces: `docker compose up --build` → nginx :8080 (статика + `/api` прокси); `pnpm check:size` → падает при >200 КБ gzip.

- [ ] **Step 1:** `scripts/check-size.mjs`: gzip-размер `dist/assets/*.js` ≤ 200_000 байт; подключить в `build`-пайплайн. Зафиксировать текущий размер в PROGRESS.
- [ ] **Step 2:** Nginx: gzip on (text/html, js, css, svg), `location /api/ { proxy_pass http://server:4000; }`, для `/api/events`: `proxy_buffering off; proxy_read_timeout 1h;`. Статика — immutable-кэш для хэшированных assets.
- [ ] **Step 3:** Dockerfiles: клиент — multi-stage (node:20 build → nginx:alpine); сервер — node:20-alpine. `.env` → `VITE_API_BASE_URL`, `PORT` сервера.
- [ ] **Step 4:** Проверка: `docker compose up --build` → `curl localhost:8080/api/org-tree` → 200; страница отдаётся с gzip (`curl -H 'Accept-Encoding: gzip' -I`).
- [ ] **Step 5:** Commit: `git commit -m "chore(deploy): docker compose, nginx gzip/proxy, bundle size budget"`.

### Task 12: AI-поиск

**Files:**
- Create: `src/domain/search.ts`, `src/components/AiSearchBar.tsx`
- Modify: `src/components/OrgDashboard.tsx`
- Test: `src/domain/search.test.ts`

**Interfaces:**
- Consumes: `OrgNode[]`, `matchesFilter`.
- Produces: `parseNaturalQuery(q: string, nodes: OrgNode[]): StructuredFilter | null`; `StructuredFilter = { nameSubstring?: string; minHeadcount?: number; minBudget?: number; minPerformance?: number }`.

- [ ] **Step 1:** тесты парсера: «команды с бюджетом больше 1 млн» → `{ nameSubstring: 'команда', minBudget: 1_000_000 }`; «эффективность выше 80» → `{ minPerformance: 80 }`; «больше 20 человек» → `{ minHeadcount: 20 }`; нераспознанное → `null` → fallback `matchesFilter`. Правила: regex-шаблоны по словарю (рублей/человек/эффективность/больше-меньше), нормализация «1 млн/1к». Реализация — чистые функции, без LLM.
- [ ] **Step 2:** `<AiSearchBar/>`: ввод → structured filter применяется к строкам таблицы + подсветка совпавших узлов в дереве; под полем — подпись «распознано: …» или «обычный поиск».
- [ ] **Step 3:** Commit: `git commit -m "feat(search): natural-language query parser with text-search fallback"`.

### Task 13: Финализация

**Files:**
- Modify: `README.md`, `docs/ai.md`, `docs/PROGRESS.md`
- Create: скриншоты `docs/screenshots/*.png` (или GIF)

- [ ] **Step 1:** `docs/ai.md`: что генерировали AI, что переписали руками и почему (по факту работы, не выдумка).
- [ ] **Step 2:** README: раздел «AI в разработке» (ссылка на docs/ai.md), запуск одной командой, скриншоты.
- [ ] **Step 3:** Проверка чек-листа сдачи: теги `step/1..4`, unit-тест агрегации, docs (architecture/data-model/ADR), PROGRESS актуален.
- [ ] **Step 4:** Commit + тег: `git commit -m "docs: final readme, AI usage notes, screenshots"`; `git tag step/4`.
