import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ReportDayPoint } from '@/lib/assistantRelatorio'

// Mini gráfico de barra por dia do Relatório do Assistente. Carregado via
// React.lazy em AssistantRelatorio.tsx (mesmo padrão de code-splitting de
// recharts usado em FinancialsPage/FinancialsCharts.tsx).
export function AssistantInteractionsBarChart({ data }: { data: ReportDayPoint[] }) {
  const chartData = data.map(point => ({ ...point, label: format(parseISO(point.date), 'dd/MM', { locale: ptBR }) }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v: number) => [v, 'Interações']}
          labelFormatter={label => `Dia ${label}`}
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: 12 }}
        />
        <Bar dataKey="total" name="Interações" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
