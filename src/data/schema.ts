import { z } from 'zod';

export const orgNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().nullable(),
  headcount: z.number().int().positive(),
  budget: z.number().int().nonnegative(),
  performance: z.number().min(0).max(100),
  updatedAt: z.iso.datetime(),
});

// Empty array is a valid response (UI shows the Empty state) — no .min(1).
export const orgTreeSchema = z.array(orgNodeSchema);

export type OrgNode = z.infer<typeof orgNodeSchema>;

/**
 * Мутируемые поля узла, которые сервер может прислать в SSE-патче.
 * Все ограничения совпадают с orgNodeSchema.
 */
export const patchChangesSchema = z.object({
  headcount: z.number().int().positive().optional(),
  budget: z.number().int().nonnegative().optional(),
  performance: z.number().min(0).max(100).optional(),
});

/**
 * SSE-патч: `event: patch` → `data` с /api/events.
 * Неизвестные ключи в `changes` и на верхнем уровне zod отбрасывает по
 * умолчанию (strip), поэтому патч от будущего сервера с лишними полями
 * не упадёт; пустой `changes` (ни одного известного поля) отклоняется.
 */
export const patchSchema = z.object({
  id: z.string().min(1),
  changes: patchChangesSchema.refine((changes) => Object.keys(changes).length >= 1, {
    message: 'changes must contain at least one known mutable field',
  }),
  updatedAt: z.iso.datetime(),
});

export type Patch = z.infer<typeof patchSchema>;
