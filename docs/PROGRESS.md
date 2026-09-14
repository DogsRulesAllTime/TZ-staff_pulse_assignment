# PROGRESS — git story

Журнал работы: каждый коммит фиксируется здесь (hash, этап, что сделано, какие требования
задания закрыты). Задание = необходимый минимум; «Минимум» — пункт этапа задания,
«Сверх» — инженерные добавки сверх минимума.

Текущий этап: **01 FOUNDATION — ✅ завершён, тег `step/1`** (56/56 тестов, tsc чистый, бандл 116 КБ gzip).

## Журнал

| # | Дата | Commit | Этап | Сделано | Минимум | Сверх |
|---|------|--------|------|---------|---------|-------|
| 1 | 2025-09-14 | `8242e26` | docs | README, architecture, data-model, 5 ADR, план (12 задач / 4 этапа), PROGRESS | — | ADR-формат, бюджет бандла-проверка, git-story процесс |
| 2 | 2025-09-14 | `78d6a4a` | 01 | Scaffold: Vite+React+TS strict, `@/`-алиас (vite+vitest+tsconfig), styled-components тема (токены performance/status/motion), TanStack Query staleTime 5000 + retry 1, Vitest+RTL+jest-dom, smoke-тест «Staff Pulse» | «Scaffold: Vite + React + TypeScript, абсолютные импорты» | тема с дизайн-токенами и DefaultTheme-аугментацией; тест-инфраструктура с первого коммита |
| 3 | 2025-09-14 | `56e1ac5` | 01 | Mock-сервер: Express :4000, GET /api/org-tree (45 узлов: 4 дивизиона → 2–3 отдела → 2–3 команды, seeded PRNG — детерминированно), GET /api/events SSE `event: patch` {id, changes, updatedAt}, мутации 2–6с (headcount ±1–3, budget ±1–10%, performance ±10 clamp), heartbeat 15с, CORS; 16 тестов (RED→GREEN) | «Реализуйте собственный сервер… Минимум 40 узлов, не менее трёх уровней» | детерминированные данные (seed 20250601); hub-трансляция с отпиской на disconnect; чистые org-data/mutations отделены от транспорта; property-тесты clamp-границ |
| 4 | 2025-09-14 | `056fb33` | 01 | Data-слой: zod v4 схема узла (`z.iso.datetime()`), fetchOrgTree (timeout 10с, ApiError kinds: network/http/invalid_payload c zod-issue-сводкой), ORG_TREE_KEY + useOrgTreeQuery; 18 тестов RED→GREEN | «Схема API-ответа валидируется на клиенте; невалидный ответ — ошибка» | типизированная таксономия ошибок вместо «одной ошибки на всё»; пустой массив = валидный ответ (Empty-состояние) |
| 5 | 2025-09-14 | `b01e595` | 01 | Ревью-фикс: validateForest удалён из data-слоя — валидация леса переезжает в domain (Task 4); ассерт сигнала в api-тесте | — | — |
| 6 | 2025-09-14 | `52b9870` | 01 | Domain: buildForest (Map-проход, DataError: висячий parentId / цикл / дубликат id), defaultExpanded depth ≤ 1; useOrgData (status: loading/error/empty/ready); OrgTree (рекурсия, шеврон-togglе, name + headcount + PerformanceDot), OrgDashboard (скелетон / «Повторить»→refetch / «Нет данных»), a11y: role tree/treeitem/group, aria-expanded; 51 тест | «Интерактивное дерево: раскрытие/скрытие ветвей, второй уровень открыт по умолчанию… Состояния: загрузка, ошибка, пустой ответ» | a11y-роли tree/treeitem + alert/busy; DataError-контракт (включая дубликаты id); тесты цветов через getComputedStyle |
| 7 | 2025-09-14 | `cf756ce` | 01 | Ревью-фикс: DataError из buildForest → status 'error' (не краш рендера); +2 hook-теста | — | — |
| 8 | 2025-09-14 | `50eb50d` | 01 | Финальное ревью ветки: expansion сохраняется при refetch (prevForest ref, RED→GREEN), SSE res.on('error') против ERR_STREAM_DESTROYED, mid-порог PerformanceDot в тестах, lang=ru, typecheck:node в build, чистка миноров; 56 тестов | — | финальное whole-branch ревью как отдельная ступень процесса |

## Чек-лист этапов

- [x] `step/1` FOUNDATION — Tasks 1–4: scaffold ✅ mock API ✅ валидация ✅ кэш stale 5s ✅ дерево ✅ состояния ✅
- [ ] `step/2` CORE — Tasks 5–6
- [ ] `step/3` POLISH — Tasks 7–9
- [ ] `step/4` BONUS — Tasks 10–12

## Известные отклонения / решения по ходу

1. **Стек новее плана:** React 19.3 / Vite 8.3 / TypeScript 7.0 (native, без `baseUrl` в tsconfig — paths работает) вместо «React 18, Vite 5» из плана. Причина: create-vite-актуальные версии на момент старта; всё проверено тестами и билдом. Риск: TS7 native — следить за совместимостью типов на этапах 02–04.
2. **`validateForest` убран из data-слоя** (ADR-подобный ruling по итогам ревью Task 3): валидация леса (parent-refs, циклы, дубликаты) — в `buildForest` в domain/tree.ts с контрактом DataError → UI ErrorState.
3. **Vitest config слит в vite.config.ts** (было два источника алиаса — ревью указало на дублирование).
4. **Порты :5173/:5174 заняты посторонними процессами** на этой машине — Vite в dev поднимается на :5175; тесты не зависят от портов.
5. **zod v4**: `z.iso.datetime()` вместо устаревшего `z.string().datetime()`.

## Известные отложенные миноры (для stage 02+ / финального ревью)

- SSE-транспорт сервера не покрыт unit-тестами (только ручная проверка; `formatPatchEvent`/`createSseHub` чистые — дёшево покрыть, stage 03 зависит от wire-контракта)
- `node()`-фикстура дублируется в 3 тест-файлах → извлечь в `src/test/factories.ts` в Task 6
- `as never` касты в моках useQueryResult → типизированный хелпер
- DataError-детали не всплывают в UI (нет поля error в OrgData) — при появлении диагностики
- Ошибочный payload → потом успешный retry пере-инициализирует expansion дефолтами (edge)
- stale-id в expanded-наборе не чистятся (безвредно: патчи не меняют структуру)
- Типографика вне токенов (App.tsx, OrgNodeRow.tsx) → type-scale в stage 02
- `server.close()` graceful shutdown → stage 04 (Docker)
- CORS_ORIGIN без trim, topUpToMinNodes без guard — моковые мелочи, низкий приоритет
