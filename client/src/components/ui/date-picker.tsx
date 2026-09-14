import { CalendarIcon, X } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { dateToIso, formatDate, isoToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: string
  onChange: (isoDate: string) => void
  placeholder: string
  'aria-label': string
  disabled?: (date: Date) => boolean
  className?: string
}

function DatePicker({ value, onChange, placeholder, disabled, className, ...aria }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = value ? isoToDate(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={aria['aria-label']}
          className={cn(
            'h-9 w-full min-w-0 justify-start gap-2 px-3 font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-60" />
          <span className="truncate">{value ? formatDate(value) : placeholder}</span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Xoá ${aria['aria-label'].toLowerCase()}`}
              className="ml-auto rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={(ev) => {
                ev.stopPropagation()
                onChange('')
              }}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  ev.stopPropagation()
                  onChange('')
                }
              }}
            >
              <X className="size-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={disabled}
          onSelect={(date) => {
            onChange(date ? dateToIso(date) : '')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
