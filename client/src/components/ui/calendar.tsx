import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { vi } from 'react-day-picker/locale'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={vi}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-3',
        month_caption: 'flex justify-center items-center h-8 relative',
        caption_label: 'text-sm font-medium capitalize',
        nav: 'flex items-center justify-between absolute inset-x-0 top-0 h-8 px-1',
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-7 p-0 text-muted-foreground hover:text-foreground'
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-7 p-0 text-muted-foreground hover:text-foreground'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground w-8 font-normal text-xs',
        week: 'flex w-full mt-1',
        day: 'p-0 text-center text-sm relative [&:has([data-selected])]:bg-accent first:[&:has([data-selected])]:rounded-l-md last:[&:has([data-selected])]:rounded-r-md',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-8 p-0 font-normal aria-selected:opacity-100 rounded-md'
        ),
        selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
        today: '[&>button]:border [&>button]:border-input',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
