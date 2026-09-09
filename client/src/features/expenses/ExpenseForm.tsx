import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarDays } from 'lucide-react'
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
      receipt: expense.receipt,
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

  const splitMode = useWatch({ control, name: 'splitMode' })
  const payerId = useWatch({ control, name: 'payerId' })
  const shareMemberIds = useWatch({ control, name: 'shareMemberIds' }) ?? []
  const shareAmounts = useWatch({ control, name: 'shareAmounts' }) ?? {}
  const amount = useWatch({ control, name: 'amount' })
  const receipt = useWatch({ control, name: 'receipt' }) ?? null

  const customTotal = shareMemberIds.reduce((sum, id) => sum + (Number(shareAmounts[id]) || 0), 0)
  const remaining = Math.round((Number(amount) || 0) - customTotal)

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

        <div className="flex items-center gap-3">
          <Label id="expense-split-mode-label">Cách chia</Label>
          <div role="group" aria-labelledby="expense-split-mode-label" className="flex gap-1 rounded-md border border-input bg-background p-0.5">
            <button
              type="button"
              onClick={() => setValue('splitMode', 'equal')}
              aria-pressed={splitMode === 'equal'}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                splitMode === 'equal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              Chia đều
            </button>
            <button
              type="button"
              onClick={() => setValue('splitMode', 'custom')}
              aria-pressed={splitMode === 'custom'}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                splitMode === 'custom' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              Chia riêng
            </button>
          </div>
        </div>

        {splitMode === 'custom' && (
          <div className="flex flex-col gap-2 border-t border-input pt-3">
            {shareMemberIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chọn người chia ở trên trước.</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
                {members
                  .filter((m) => shareMemberIds.includes(m.id))
                  .map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 truncate text-sm">{m.name}</span>
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        inputMode="numeric"
                        className="h-8 bg-background"
                        aria-label={`Số tiền ${m.name} chịu`}
                        value={shareAmounts[m.id] ?? ''}
                        onChange={(e) =>
                          setValue(`shareAmounts.${m.id}`, e.target.value === '' ? 0 : Number(e.target.value), {
                            shouldValidate: true,
                          })
                        }
                      />
                    </div>
                  ))}
              </div>
            )}
            <p className={cn('text-xs', remaining === 0 ? 'text-success' : 'text-muted-foreground')}>
              Đã chia {formatCurrency(customTotal)} / {formatCurrency(Number(amount) || 0)}
              {remaining !== 0 &&
                ` — còn ${formatCurrency(Math.abs(remaining))} ${remaining > 0 ? 'chưa chia' : 'vượt quá'}`}
            </p>
            {errors.shareAmounts?.message && (
              <p role="alert" className="text-xs text-destructive">
                {String(errors.shareAmounts.message)}
              </p>
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

      <Button type="submit" loading={isSubmitting} className="self-start">
        {expense ? 'Lưu thay đổi' : mode === 'admin' ? 'Thêm khoản chi' : 'Gửi yêu cầu'}
      </Button>
    </form>
  )
}

export { ExpenseForm }
