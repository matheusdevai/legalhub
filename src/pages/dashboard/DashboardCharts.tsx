import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function TaskscoreBarChart({
  mode, monthlyScores, dailyScores,
}: {
  mode: 'mensal' | 'diario'
  monthlyScores: { month: string; label: string; count: number }[]
  dailyScores: { date: string; dayLabel: string; count: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      {mode === 'mensal' ? (
        <BarChart data={monthlyScores} barSize={28} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={22} />
          <Tooltip
            formatter={(value: number) => [`${value} tarefa${value !== 1 ? 's' : ''}`, 'Concluídas']}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Bar dataKey="count" fill="#94a3b8" radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : (
        <BarChart data={dailyScores} barSize={28} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={22} />
          <Tooltip
            formatter={(value: number) => [`${value} tarefa${value !== 1 ? 's' : ''}`, 'Concluídas']}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Bar dataKey="count" fill="#0f172a" radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  )
}
