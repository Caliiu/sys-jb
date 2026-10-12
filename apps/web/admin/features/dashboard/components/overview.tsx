'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

// Valores de exemplo fixos (o template sorteava: no Next, servidor e navegador desenhariam gráficos diferentes).
const data = [
  { name: 'Jan', total: 4200 },
  { name: 'Fev', total: 3100 },
  { name: 'Mar', total: 5600 },
  { name: 'Abr', total: 2800 },
  { name: 'Mai', total: 4900 },
  { name: 'Jun', total: 3700 },
  { name: 'Jul', total: 5200 },
  { name: 'Ago', total: 4400 },
  { name: 'Set', total: 3900 },
  { name: 'Out', total: 5800 },
  { name: 'Nov', total: 4600 },
  { name: 'Dez', total: 5100 },
];

export function Overview() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          direction="ltr"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
        />
        <Bar dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} className="fill-primary" />
      </BarChart>
    </ResponsiveContainer>
  );
}
