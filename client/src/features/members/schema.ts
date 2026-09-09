import { z } from 'zod'

export const memberNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Tên thành viên không được để trống')
    .max(60, 'Tên thành viên tối đa 60 ký tự'),
})

export type MemberNameFormValues = z.infer<typeof memberNameSchema>
