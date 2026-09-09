import { z } from 'zod'

export const splitModes = ['equal', 'custom'] as const
export type SplitMode = (typeof splitModes)[number]

export const expenseFormSchema = z
  .object({
    date: z.string().min(1, 'Vui lòng chọn ngày'),
    description: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập mô tả khoản chi')
      .max(200, 'Mô tả tối đa 200 ký tự'),
    amount: z
      .number({ error: 'Vui lòng nhập số tiền hợp lệ' })
      .positive('Số tiền phải lớn hơn 0'),
    payerId: z.string().min(1, 'Vui lòng chọn người đã trả'),
    shareMemberIds: z.array(z.string()).min(1, 'Chọn ít nhất 1 người chia khoản này'),
    splitMode: z.enum(splitModes),
    shareAmounts: z.record(z.string(), z.number()).optional(),
    receipt: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.splitMode !== 'custom') return
    // Khớp đúng luật phía server (validateShareAmounts): mỗi người được tick phải
    // có số tiền > 0 — không được để ngầm 0đ, phải bỏ tick nếu người đó không chia.
    const zeroOrMissing = data.shareMemberIds.filter((id) => !((data.shareAmounts?.[id] ?? 0) > 0))
    if (zeroOrMissing.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Mỗi người được chọn ở trên phải có số tiền chia riêng lớn hơn 0 — bỏ tick người không chia khoản này',
        path: ['shareAmounts'],
      })
      return
    }
    const total = data.shareMemberIds.reduce((sum, id) => sum + (data.shareAmounts?.[id] ?? 0), 0)
    if (Math.round(total) !== Math.round(data.amount)) {
      ctx.addIssue({
        code: 'custom',
        message: `Tổng chia riêng (${Math.round(total).toLocaleString('vi-VN')}đ) phải bằng đúng tổng tiền (${Math.round(data.amount).toLocaleString('vi-VN')}đ)`,
        path: ['shareAmounts'],
      })
    }
  })

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>
