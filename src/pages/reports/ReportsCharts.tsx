import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell as PieCell,
} from 'recharts'
import type { AgilityMetrics } from '@/lib/reportsUtils'

export function AgilityDonutChart({ metrics }: { metrics: AgilityMetrics }) {
  return (
    <ResponsiveContainer width={200} height={160}>
      <PieChart>
        <Pie
          data={[
            { name: 'Em dia', value: metrics.onTime, fill: '#10b981' },
            { name: 'Com atraso', value: metrics.late, fill: '#f59e0b' },
            { name: 'Pendentes', value: metrics.pending, fill: '#6366f1' },
            { name: 'Vencidas', value: metrics.overdue, fill: '#ef4444' },
            ...(metrics.total === 0 ? [{ name: 'Sem dados', value: 1, fill: '#e5e7eb' }] : []),
          ]}
          cx="50%" cy="50%" innerRadius={45} outerRadius={72}
          dataKey="value" startAngle={90} endAngle={-270}
        >
          {[{ fill: '#10b981' }, { fill: '#f59e0b' }, { fill: '#6366f1' }, { fill: '#ef4444' }, { fill: '#e5e7eb' }].map((c, i) => (
            <PieCell key={i} fill={c.fill} />
          ))}
        </Pie>
        <Tooltip formatter={(v, n) => [`${v} tarefa(s)`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function OutcomesDonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false} fontSize={11}>
          {data.map((e, i) => <PieCell key={i} fill={e.color} />)}
        </Pie>
        <Tooltip formatter={(v) => [`${v} processo(s)`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

const COLORS = ['#0f172a', '#94a3b8', '#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316']

export function ProcessesByMonthBarChart({ data, seriesNames }: { data: any[]; seriesNames: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {seriesNames.map((name, i) => (
          <Bar key={name} dataKey={name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
