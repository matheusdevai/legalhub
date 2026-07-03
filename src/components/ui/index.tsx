import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, X } from 'lucide-react'

// ─── Button ────────────────────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]'
  const variants = {
    primary:  'bg-primary-600 hover:bg-primary-700 text-white shadow-button hover:shadow-button-lg focus:ring-primary-400',
    secondary:'bg-white dark:bg-dark-700 border border-slate-200 dark:border-dark-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-600 focus:ring-slate-300',
    ghost:    'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-700 focus:ring-slate-300',
    danger:   'bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-red-400',
    outline:  'border border-slate-200 dark:border-dark-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-700 focus:ring-primary-400',
  }
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-sm' }
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
}

// ─── Input ─────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, className, ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</label>}
    <input ref={ref} className={cn(
      'w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-all',
      'border-slate-200 bg-white text-slate-900 placeholder-slate-400',
      'dark:border-dark-600 dark:bg-dark-700 dark:text-slate-100 dark:placeholder-slate-500',
      'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30',
      error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
      className
    )} {...props} />
    {hint && !error && <span className="text-xs text-slate-400">{hint}</span>}
    {error && <span className="text-xs text-red-500">{error}</span>}
  </div>
))
Input.displayName = 'Input'

// ─── Select ────────────────────────────────────────────────────────────────
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; error?: string; children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, className, children, ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</label>}
    <select ref={ref} className={cn(
      'w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-all cursor-pointer',
      'border-slate-200 bg-white text-slate-900',
      'dark:border-dark-600 dark:bg-dark-700 dark:text-slate-100',
      'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30',
      error && 'border-red-400',
      className
    )} {...props}>{children}</select>
    {error && <span className="text-xs text-red-500">{error}</span>}
  </div>
))
Select.displayName = 'Select'

// ─── Textarea ──────────────────────────────────────────────────────────────
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string; error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, className, ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</label>}
    <textarea ref={ref} rows={3} className={cn(
      'w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-all resize-none',
      'border-slate-200 bg-white text-slate-900 placeholder-slate-400',
      'dark:border-dark-600 dark:bg-dark-700 dark:text-slate-100 dark:placeholder-slate-500',
      'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30',
      error && 'border-red-400',
      className
    )} {...props} />
    {error && <span className="text-xs text-red-500">{error}</span>}
  </div>
))
Textarea.displayName = 'Textarea'

// ─── Card ──────────────────────────────────────────────────────────────────
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn('bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-dark-700/50 shadow-card', className)} {...props}>
      {children}
    </div>
  )
}

// ─── Badge ─────────────────────────────────────────────────────────────────
export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', className)}>
      {children}
    </span>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn(
        'relative bg-white dark:bg-dark-800 w-full sm:rounded-2xl shadow-modal animate-slide-up',
        'border-0 sm:border border-slate-200 dark:border-dark-700/50',
        sizes[size]
      )}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dark-700/50">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-6 max-h-[82vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-dark-700 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-slate-400 dark:text-slate-500" />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
      {description && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">{description}</p>}
    </div>
  )
}

// ─── Spinner ───────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-primary-600', className)} />
}

// ─── Stats Card ────────────────────────────────────────────────────────────
export function StatsCard({ label, value, icon: Icon, color = 'blue', trend }: {
  label: string; value: string | number; icon: React.ElementType
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'indigo'
  trend?: { value: number; label: string }
}) {
  const colors: Record<string, { wrap: string; icon: string }> = {
    blue:   { wrap: 'bg-blue-50   dark:bg-blue-900/15   border-blue-100   dark:border-blue-800/20',   icon: 'text-blue-600   dark:text-blue-400'   },
    green:  { wrap: 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-100 dark:border-emerald-800/20', icon: 'text-emerald-600 dark:text-emerald-400' },
    purple: { wrap: 'bg-violet-50 dark:bg-violet-900/15 border-violet-100 dark:border-violet-800/20', icon: 'text-violet-600 dark:text-violet-400' },
    indigo: { wrap: 'bg-indigo-50 dark:bg-indigo-900/15 border-indigo-100 dark:border-indigo-800/20', icon: 'text-indigo-600 dark:text-indigo-400' },
    orange: { wrap: 'bg-orange-50 dark:bg-orange-900/15 border-orange-100 dark:border-orange-800/20', icon: 'text-orange-600 dark:text-orange-400' },
    red:    { wrap: 'bg-red-50   dark:bg-red-900/15   border-red-100   dark:border-red-800/20',   icon: 'text-red-600   dark:text-red-400'   },
    pink:   { wrap: 'bg-pink-50   dark:bg-pink-900/15   border-pink-100   dark:border-pink-800/20',   icon: 'text-pink-600   dark:text-pink-400'   },
  }
  const c = colors[color]
  return (
    <Card className="p-5 hover:shadow-card-hover hover:-translate-y-px transition-all duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 leading-none">{value}</p>
          {trend && (
            <p className={cn('text-xs mt-2 font-medium', trend.value >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% <span className="text-slate-400 font-normal">{trend.label}</span>
            </p>
          )}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border', c.wrap)}>
          <Icon className={cn('w-5 h-5', c.icon)} />
        </div>
      </div>
    </Card>
  )
}
