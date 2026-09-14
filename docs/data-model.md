# Модель данных

## Узел орг-структуры

Контракт `GET /api/org-tree` (плоский массив):

```ts
interface OrgNode {
  id: string;          // уникален, например "div-1", "dept-1-2", "team-1-2-3"
  name: string;
  parentId: string | null; // null — корень (дивизион)
  headcount: number;   // > 0
  budget: number;      // руб., целое
  performance: number; // 0..100
  updatedAt: string;   // ISO 8601
}
```

Валидация — zod-схема на границе API: `orgNodeSchema.array().min(1)`; пустой массив —
валидный ответ со специальным Empty-состоянием; объект не по схеме — Error-состояние.

## Дерево

Строится одним проходом из плоского массива (`domain/tree.ts`):

```ts
interface TreeNode extends OrgNode {
  children: TreeNode[];
  depth: number; // 0 = дивизион, 1 = отдел, 2 = команда
}
interface Forest {
  byId: Map<string, TreeNode>;
  roots: TreeNode[];
  parentOf: Map<string, string | null>; // быстрый подъём к предкам
}
```

- Циклы и «висячие» parentId (ссылка на несуществующий узел) — невалидные данные → Error.
- Второй уровень раскрыт по умолчанию (`defaultExpanded = depth <= 1`).

## Агрегация

Однопроходный post-order DFS (`domain/aggregation.ts`); возвращается `Map<id, Aggregates>`.

```ts
interface Aggregates {
  totalHeadcount: number;      // узел + все потомки
  totalBudget: number;         // узел + все потомки
  weightedPerformance: number; // Σ(perf_i × headcount_i) / Σ headcount_i, включая узел
}
```

Инвариант: для листа агрегаты = собственные значения; для внутреннего узла —
собственные значения + сумма агрегатов детей. Сложность O(n), вызывается **один раз**
после загрузки и мемоизируется.

### Инкрементальный пересчёт (live)

При патче узла `X`:
1. Обновить значения X.
2. Подъём по `parentOf` до корней: пересчитать агрегаты только этой ветки.
3. Все остальные узлы сохраняют кэшированные агрегаты.

Сложность — O(глубина ветки), полный DFS не запускается.

## Контракт SSE-патча (`GET /api/events`, `event: patch`)

```jsonc
{
  "id": "team-1-2-3",
  "changes": { "headcount": 12, "performance": 71.5 }, // подмножество полей узла, без id/parentId
  "updatedAt": "2025-09-14T12:00:00.000Z"
}
```

Клиент:
1. Валидирует `patchSchema` (zod); невалидный патч игнорируется с `console.warn`.
2. `applyPatch(forest, patch)` мутирует копию узла в `byId` (структурная замена узла,
   не всего дерева) и обновляет `updatedAt`.
3. Помечает затронутые ячейки для fade-out ~1.5с; пересчитывает агрегаты ветки.
4. Структурные изменения (add/remove/reparent) сервер в этом протоколе не шлёт —
   при необходимости клиент выполняет полный refetch (задание этого не требует).

## Форматирование

- Бюджет: `Intl.NumberFormat('ru-RU')` → `12 345 678 руб.` (узлы и агрегаты — одинаково).
- Эффективность: `71.5 %` (одна десятичная при дробном значении).
- Цветовой индикатор performance: `≥ 80` зелёный, `50–79` жёлтый, `< 50` красный.
