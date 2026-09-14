import { z } from 'zod'

export const orgNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().nullable(),
  headcount: z.number().int().positive(),
  budget: z.number().int().nonnegative(),
  performance: z.number().min(0).max(100),
  updatedAt: z.iso.datetime(),
})

// Empty array is a valid response (UI shows the Empty state) — no .min(1).
export const orgTreeSchema = z.array(orgNodeSchema)

export type OrgNode = z.infer<typeof orgNodeSchema>
