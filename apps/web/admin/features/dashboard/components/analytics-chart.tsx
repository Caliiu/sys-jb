'use client';

import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

// Valores de exemplo fixos (ver overview.tsx).
const data = [
  { name: 'Seg', clicks: 620, uniques: 410 },
  { name: 'Ter', clicks: 540, uniques: 380 },
  { name: 'Qua', clicks: 710, uniques: 500 },
  { name: 'Qui', clicks: 680, uniques: 470 },
  { name: 'Sex', clicks: 890, uniques: 610 },
  { name: 'Sáb', clicks: 960, uniques: 700 },
  { name: 'Dom', clicks: 750, uniques: 520 },
];

export function AnalyticsChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <Area
          type="monotone"
          dataKey="clicks"
          stroke="currentColor"
          className="text-primary"
          fill="currentColor"
          fillOpacity={0.15}
        />
        <Area
          type="monotone"
          dataKey="uniques"
          stroke="currentColor"
          className="text-muted-foreground"
          fill="currentColor"
          fillOpacity={0.1}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
