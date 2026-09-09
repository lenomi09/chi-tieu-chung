import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarDays, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppState } from '@/context/AppStateContext'
import { api, ApiError } from '@/lib/api'
import { formatCurrency, todayIso } from '@/lib/format'
import type { Expense, ExpensePayload, Member } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ReceiptUpload } from './ReceiptUpload'
import { type ExpenseFormValues, expenseFormSchema } from './schema'
import { computeItemBasedShares, parseSumExpression, type SplitItem } from './shareUtils'

const MEMBER_PICKER_GRID = 'grid grid-cols-2 gap-x-2 gap-y-0.5 sm:grid-cols-4'

interface ExpenseFormProps {
  members: Member[]
  expense?: Expense | null
  /** admin: lưu trực tiếp (approved ngay). request: gửi yêu cầu, chờ admin duyệt. */
  mode: 'admin' | 'request'
  onDone?: () => void
}

function buildDefaultValues(members: Member[], expense?: Expense | null): ExpenseFormValues {
  if (expense) {
    return {
      date: expense.date,
      description: expense.description,
      amount: expense.amount,
      payerId: expense.payerId,
      shareMemberIds: expense.shareMemberIds,
      splitMode: expense.shareAmounts ? 'custom' : 'equal',
      shareAmounts: expense.shareAmounts ?? {},
      // Ảnh bill thật không kèm sẵn trong expense nữa (nặng — xem
      // client/src/lib/types.ts) — tải riêng bên dưới nếu hasReceipt.
      receipt: null,
    }
  }
  return {
    date: todayIso(),
    description: '',
    // Để trống thay vì mặc định 0 — 0 trông giống một số tiền thật đã nhập.
    amount: undefined as unknown as number,
    payerId: members[0]?.id ?? '',
    shareMemberIds: members.map((m) => m.id),
    splitMode: 'equal',
    shareAmounts: {},
    receipt: null,
  }
}

function ExpenseForm({ members, expense, mode, onDone }: ExpenseFormProps) {
  const { mutate } = useAppState()
  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: buildDefaultValues(members, expense),
  })

  // Sửa 1 khoản chi đã có sẵn ảnh bill — ảnh không kèm sẵn trong expense nữa
  // (xem client/src/lib/types.ts), tải riêng ở đây để prefill ReceiptUpload.
  // Chặn submit trong lúc đang tải (receiptLoading) — nếu không, submit "hụt"
  // trước khi tải xong sẽ gửi receipt=null, xoá mất ảnh cũ ngoài ý muốn.
  const [receiptLoading, setReceiptLoading] = useState(!!expense?.hasReceipt)
  useEffect(() => {
    if (!expense?.hasReceipt) {
      setReceiptLoading(false)
      return
    }
    let cancelled = false
    setReceiptLoading(true)
    api.getExpenseReceipt(expense.id).then(({ receipt }) => {
      if (cancelled) return
      setValue('receipt', receipt)
      setReceiptLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense?.id, expense?.hasReceipt])

  const payerId = useWatch({ control, name: 'payerId' })
  const shareMemberIds = useWatch({ control, name: 'shareMemberIds' }) ?? []
  const shareAmounts = useWatch({ control, name: 'shareAmounts' }) ?? {}
  const amount = useWatch({ control, name: 'amount' })
  const receipt = useWatch({ control, name: 'receipt' }) ?? null

  const customTotal = shareMemberIds.reduce((sum, id) => sum + (Number(shareAmounts[id]) || 0), 0)
  const remaining = Math.round((Number(amount) || 0) - customTotal)

  // "Chia theo món": splitMode vẫn là 'custom' khi submit — không đổi
  // backend/schema. Người dùng khai báo từng món + ai ăn chung, phần còn
  // lại tự chia đều cho nhóm chọn — hệ thống tự tính ra shareAmounts cuối
  // cùng và điền vào form.
  const editingExistingCustom = !!expense?.shareAmounts
  const [splitUiMode, setSplitUiMode] = useState<'equal' | 'byItem'>(editingExistingCustom ? 'byItem' : 'equal')
  const [items, setItems] = useState<SplitItem[]>([])
  const itemIdCounter = useRef(0)
  // Sửa 1 khoản chi đã có sẵn shareAmounts (chia riêng/chia theo món từ
  // trước) — không tự tính lại (sẽ ghi đè mất số cũ) cho tới khi người dùng
  // thật sự thao tác gì đó ở "Chia theo món" (thêm/xoá món, đổi ai nhận
  // phần còn lại,...). Khoản chi mới thì tính ngay từ đầu vì chưa có gì để mất.
  const byItemTouched = useRef(!editingExistingCustom)

  // Ai nhận "phần còn lại" (số tiền không thuộc món nào) — mặc định là tất cả
  // "Chia cho", nhưng có thể thu hẹp lại (vd: có món chia đều cho tất cả,
  // còn phần còn lại chỉ chia cho 1 nhóm nhỏ hơn, không phải ai cũng nhận).
  // Chỉ tự đồng bộ theo "Chia cho" khi người dùng CHƯA tự tay chỉnh danh
  // sách này — tránh xoá mất lựa chọn thu hẹp của họ mỗi khi tick/bỏ tick
  // "Chia cho" ở trên.
  const [remainingMemberIds, setRemainingMemberIds] = useState<string[]>(shareMemberIds)
  const remainingTouched = useRef(false)

  useEffect(() => {
    if (remainingTouched.current) {
      setRemainingMemberIds((prev) => prev.filter((id) => shareMemberIds.includes(id)))
    } else {
      setRemainingMemberIds(shareMemberIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareMemberIds])

  const toggleRemainingMember = (memberId: string, checked: boolean) => {
    remainingTouched.current = true
    remainingTouched.current = true
    byItemTouched.current = true
    setRemainingMemberIds((prev) => (checked ? [...prev, memberId] : prev.filter((id) => id !== memberId)))
  }

  const addItem = () => {
    byItemTouched.current = true
    itemIdCounter.current += 1
    setItems((prev) => [...prev, { id: `item-${itemIdCounter.current}`, name: '', amountText: '', memberIds: [] }])
  }
  const removeItem = (id: string) => {
    byItemTouched.current = true
    setItems((prev) => prev.filter((it) => it.id !== id))
  }
  const updateItemName = (id: string, name: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, name } : it)))
  const updateItemAmount = (id: string, amountText: string) => {
    byItemTouched.current = true
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, amountText } : it)))
  }
  const toggleItemMember = (itemId: string, memberId: string, checked: boolean) => {
    byItemTouched.current = true
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              memberIds: checked ? [...it.memberIds, memberId] : it.memberIds.filter((id) => id !== memberId),
            }
          : it
      )
    )
  }

  const itemsTotal = items.reduce((sum, it) => sum + parseSumExpression(it.amountText), 0)
  const remainingForItems = Math.round((Number(amount) || 0) - itemsTotal)

  // Mỗi khi món/số tiền/danh sách chia thay đổi ở chế độ "Chia theo món", tự
  // tính lại shareAmounts và điền vào form. Bỏ qua nếu đang sửa 1 khoản chi
  // có sẵn số chia riêng mà người dùng chưa thật sự đụng vào "Chia theo
  // món" — tránh ghi đè mất số cũ chỉ vì mở form sửa lên xem.
  useEffect(() => {
    if (splitUiMode !== 'byItem' || !byItemTouched.current) return
    const computed = computeItemBasedShares(items, remainingMemberIds, shareMemberIds, Number(amount) || 0)
    for (const id of shareMemberIds) {
      setValue(`shareAmounts.${id}`, computed[id] ?? 0, { shouldValidate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitUiMode, items, remainingMemberIds, shareMemberIds, amount])

  const toggleMember = (id: string, checked: boolean) => {
    const next = checked ? [...shareMemberIds, id] : shareMemberIds.filter((m) => m !== id)
    setValue('shareMemberIds', next, { shouldValidate: true })
  }

  const selectAllMembers = () => {
    setValue(
      'shareMemberIds',
      members.map((m) => m.id),
      { shouldValidate: true }
    )
  }

  const deselectAllMembers = () => {
    setValue('shareMemberIds', [], { shouldValidate: true })
  }

  const onSubmit = async (values: ExpenseFormValues) => {
    const payload: ExpensePayload = {
      date: values.date,
      description: values.description.trim(),
      amount: Math.round(values.amount),
      payerId: values.payerId,
      shareMemberIds: values.shareMemberIds,
      shareAmounts:
        values.splitMode === 'custom'
          ? Object.fromEntries(
              values.shareMemberIds.map((id) => [id, Math.round(values.shareAmounts?.[id] ?? 0)])
            )
          : null,
      receipt: values.receipt ?? null,
    }
    try {
      if (expense) {
        await mutate(() => api.updateExpense(expense.id, payload))
      } else if (mode === 'admin') {
        await mutate(() => api.addExpense(payload))
      } else {
        await mutate(() => api.addExpenseRequest(payload))
      }
      reset(buildDefaultValues(members, null))
      setSplitUiMode('equal')
      setItems([])
      byItemTouched.current = true
      remainingTouched.current = false
      setRemainingMemberIds(members.map((m) => m.id))
      onDone?.()
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? err.message : 'Không lưu được khoản chi' })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="expense-date" label="Ngày" required error={errors.date?.message}>
          <div className="relative">
            <Input
              id="expense-date"
              type="date"
              className="pr-9"
              aria-invalid={!!errors.date}
              {...register('date')}
            />
            <CalendarDays
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </FormField>
        <FormField id="expense-amount" label="Số tiền (đ)" required error={errors.amount?.message}>
          <Input
            id="expense-amount"
            type="number"
            min={0}
            step={1000}
            inputMode="numeric"
            aria-invalid={!!errors.amount}
            {...register('amount', { valueAsNumber: true })}
          />
        </FormField>
      </div>

      <FormField id="expense-description" label="Mô tả" required error={errors.description?.message}>
        <Input
          id="expense-description"
          placeholder="VD: Ăn trưa, đổ xăng,..."
          aria-invalid={!!errors.description}
          {...register('description')}
        />
      </FormField>

      <FormField id="expense-payer" label="Người đã trả" required error={errors.payerId?.message}>
        <Select value={payerId} onValueChange={(v) => setValue('payerId', v, { shouldValidate: true })}>
          <SelectTrigger id="expense-payer" aria-invalid={!!errors.payerId}>
            <SelectValue placeholder="Chọn người trả" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="flex flex-col gap-3 rounded-lg border border-input bg-muted/20 p-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label id="expense-share-label">Chia cho</Label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAllMembers}
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Chọn tất cả
              </button>
              <span className="text-xs text-muted-foreground/50">·</span>
              <button
                type="button"
                onClick={deselectAllMembers}
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Bỏ chọn tất cả
              </button>
            </div>
          </div>
          <div
            role="group"
            aria-labelledby="expense-share-label"
            className="grid grid-cols-2 gap-x-2 gap-y-0.5 sm:grid-cols-4"
          >
            {members.map((m) => {
              const checked = shareMemberIds.includes(m.id)
              return (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent/50"
                >
                  <Checkbox checked={checked} onCheckedChange={(v) => toggleMember(m.id, v === true)} />
                  <span className="truncate">{m.name}</span>
                </label>
              )
            })}
          </div>
          {errors.shareMemberIds?.message && (
            <p role="alert" className="text-xs text-destructive">
              {errors.shareMemberIds.message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Label id="expense-split-mode-label">Cách chia</Label>
          <div role="group" aria-labelledby="expense-split-mode-label" className="flex gap-1 rounded-md border border-input bg-background p-0.5">
            <button
              type="button"
              onClick={() => {
                setSplitUiMode('equal')
                setValue('splitMode', 'equal')
              }}
              aria-pressed={splitUiMode === 'equal'}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                splitUiMode === 'equal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              Chia đều
            </button>
            <button
              type="button"
              onClick={() => {
                byItemTouched.current = true
                setSplitUiMode('byItem')
                setValue('splitMode', 'custom')
              }}
              aria-pressed={splitUiMode === 'byItem'}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                splitUiMode === 'byItem' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              Chia theo món
            </button>
          </div>
        </div>

        {splitUiMode === 'byItem' && (
          <div className="flex flex-col gap-2 border-t border-input pt-3">
            {shareMemberIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chọn người chia ở trên trước.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {items.map((item, idx) => (
                    <div key={item.id} className="flex flex-col gap-1.5 rounded-md border border-input bg-background p-2">
                      <div className="flex items-center gap-1.5">
                        <Input
                          placeholder={`Món ${idx + 1} (không bắt buộc)`}
                          className="h-8 flex-1"
                          aria-label={`Tên món ${idx + 1}`}
                          value={item.name}
                          onChange={(e) => updateItemName(item.id, e.target.value)}
                        />
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="Số tiền"
                          className="h-8 w-28 shrink-0"
                          aria-label={`Số tiền món ${idx + 1}`}
                          value={item.amountText}
                          onChange={(e) => updateItemAmount(item.id, e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Xoá món ${idx + 1}`}
                          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className={MEMBER_PICKER_GRID}>
                        {members
                          .filter((m) => shareMemberIds.includes(m.id))
                          .map((m) => {
                            const checked = item.memberIds.includes(m.id)
                            return (
                              <label
                                key={m.id}
                                className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-accent/50"
                              >
                                <Checkbox
                                  className="size-3.5"
                                  checked={checked}
                                  onCheckedChange={(v) => toggleItemMember(item.id, m.id, v === true)}
                                />
                                <span className="truncate">{m.name}</span>
                              </label>
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1 self-start rounded px-1.5 py-1 text-xs text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <Plus className="size-3.5" />
                  Thêm món
                </button>

                {/* Phần tiền không thuộc món nào — mặc định chia đều cho tất
                    cả "Chia cho", nhưng thu hẹp được (vd: 1 món chia đều cho
                    tất cả, còn phần dư chỉ chia cho vài người, không phải
                    ai cũng nhận phần dư). */}
                <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-input bg-background p-2">
                  <p className={cn('text-xs font-medium', remainingForItems < 0 ? 'text-destructive' : 'text-foreground')}>
                    {remainingForItems < 0
                      ? `Tổng các món vượt quá tổng tiền ${formatCurrency(Math.abs(remainingForItems))}`
                      : `Phần còn lại: ${formatCurrency(remainingForItems)} — chia cho`}
                  </p>
                  {remainingForItems >= 0 && (
                    <div className={MEMBER_PICKER_GRID}>
                      {members
                        .filter((m) => shareMemberIds.includes(m.id))
                        .map((m) => {
                          const checked = remainingMemberIds.includes(m.id)
                          return (
                            <label
                              key={m.id}
                              className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-accent/50"
                            >
                              <Checkbox
                                className="size-3.5"
                                checked={checked}
                                onCheckedChange={(v) => toggleRemainingMember(m.id, v === true)}
                              />
                              <span className="truncate">{m.name}</span>
                            </label>
                          )
                        })}
                    </div>
                  )}
                  {remainingForItems > 0 && remainingMemberIds.length === 0 && (
                    <p className="text-xs text-destructive">Chọn ít nhất 1 người nhận phần còn lại.</p>
                  )}
                </div>

                {/* Khớp tổng: dùng shareAmounts thật đã điền vào form (customTotal/
                    remaining), không phải remainingForItems — để phản ánh đúng cả
                    trường hợp đang sửa khoản chi cũ mà chưa đụng vào "Chia theo
                    món" (byItemTouched=false, số cũ vẫn giữ nguyên). */}
                <p
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    remaining === 0 ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  {remaining === 0 && <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />}
                  Đã chia {formatCurrency(customTotal)} / {formatCurrency(Number(amount) || 0)}
                  {remaining !== 0 &&
                    ` — còn ${formatCurrency(Math.abs(remaining))} ${remaining > 0 ? 'chưa chia' : 'vượt quá'}`}
                </p>

                {errors.shareAmounts?.message && (
                  <p role="alert" className="text-xs text-destructive">
                    {String(errors.shareAmounts.message)}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Ảnh bill (không bắt buộc)</Label>
        <ReceiptUpload
          value={receipt}
          onChange={(v) => setValue('receipt', v)}
          onErrorMessage={(m) => setError('receipt', { message: m })}
        />
        {errors.receipt?.message && (
          <p role="alert" className="text-xs text-destructive">
            {errors.receipt.message}
          </p>
        )}
      </div>

      <Button type="submit" loading={isSubmitting || receiptLoading} disabled={receiptLoading} className="self-start">
        {receiptLoading
          ? 'Đang tải ảnh bill...'
          : expense
            ? 'Lưu thay đổi'
            : mode === 'admin'
              ? 'Thêm khoản chi'
              : 'Gửi yêu cầu'}
      </Button>
    </form>
  )
}

export { ExpenseForm }
