import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

export function RevenueExpenseLineChart({ data }: { data: { month: string; receita: number; despesa: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v > 0 ? `${(v / 1000).toFixed(0)}k` : '0'} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v: number) => formatCurrency(v)}
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: 12 }}
        />
        <Line type="monotone" dataKey="receita" name="Receita" stroke="#0f172a" strokeWidth={2} dot={{ fill: '#0f172a', r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="despesa" name="Despesa" stroke="#94a3b8" strokeWidth={2} dot={{ fill: '#94a3b8', r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function AnnualRevenueBarChart({ data }: { data: { month: string; receitas: number; despesas: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v > 0 ? `${(v / 1000).toFixed(0)}k` : '0'} />
        <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="receitas" name="Receitas" fill="#0f172a" radius={[4, 4, 0, 0]} />
        <Bar dataKey="despesas" name="Despesas" fill="#94a3b8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
