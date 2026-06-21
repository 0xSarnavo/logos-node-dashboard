"use client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useIsLight, chartColor } from "@/lib/useTheme";
import { formatClockTime as formatTime } from "@/lib/format";

interface Series {
  key: string;
  color: string;
  label: string;
}

interface MultiChartProps {
  data: Record<string, any>[];
  series: Series[];
  height?: number;
}

export default function MultiChart({ data, series, height = 200 }: MultiChartProps) {
  const light = useIsLight();
  if (!data.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-muted text-sm">
        Waiting for data...
      </div>
    );
  }

  const keys = series.map((s) => s.key);
  const chartData = data.map((d) => {
    const row: Record<string, any> = { ...d };
    for (const k of keys) row[k] = Number(d[k]) || 0;
    return row;
  });

  const gridStroke = light ? "#e2e2e6" : "#27272a";
  const tickFill = light ? "#52525b" : "#71717a";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={formatTime}
          stroke={gridStroke}
          tick={{ fill: tickFill, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          minTickGap={50}
        />
        <YAxis
          stroke={gridStroke}
          tick={{ fill: tickFill, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.15) : 1)]}
          allowDecimals={false}
        />
        <Tooltip
          cursor={false}
          contentStyle={{
            background: light ? "#ffffff" : "#18181b",
            border: `1px solid ${light ? "#d4d4d8" : "#27272a"}`,
            borderRadius: "6px",
            fontSize: "12px",
            color: light ? "#18181b" : "#fff",
          }}
          labelFormatter={formatTime}
        />
        <Legend
          wrapperStyle={{ fontSize: "11px", color: tickFill }}
        />
        {series.map((s) => {
          const sc = chartColor(s.color, light);
          return (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={sc}
            strokeWidth={2}
            fill={sc}
            fillOpacity={0.04}
            dot={false}
            isAnimationActive={false}
          />
        );})}
      </AreaChart>
    </ResponsiveContainer>
  );
}
