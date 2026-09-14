const currencyFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatCurrency(amount: number): string {
  return `${currencyFormatter.format(amount)}đ`
}

export function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return dateFormatter.format(d)
}

export function todayIso(): string {
  return dateToIso(new Date())
}

// Local date -> "YYYY-MM-DD", tránh dùng Date#toISOString() (quy đổi theo UTC,
// có thể lệch 1 ngày so với ngày hiển thị theo giờ máy người dùng).
export function dateToIso(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

// "YYYY-MM-DD" -> Date ở giờ địa phương lúc 00:00 (không lệch ngày do UTC).
export function isoToDate(isoDate: string): Date | undefined {
  const d = new Date(`${isoDate}T00:00:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}
