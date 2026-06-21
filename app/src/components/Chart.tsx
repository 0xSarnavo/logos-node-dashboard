"use client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useIsLight, chartColor } from "@/lib/useTheme";
import { formatClockTime as formatTime } from "@/lib/format";

interface ChartProps {
  data: { time: string; value: number }[];
  type?: "area" | "bar";
  color?: string;
  unit?: string;
  height?: number;
}

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-border rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">{formatTime(label)}</p>
      <p className="text-white font-medium">
        {typeof payload[0].value === "number"
          ? payload[0].value.toLocaleString()
          : payload[0].value}
        {unit ? ` ${unit}` : ""}
      </p>
    </div>
  );
}

export default function Chart({ data, type = "area", color = "#ffffff", unit, height = 200 }: ChartProps) {
  const light = useIsLight();
  if (!data.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-muted text-sm">
        Waiting for data...
      </div>
    );
  }

  const ChartComponent = type === "bar" ? BarChart : AreaChart;
  // The history API serializes numeric columns as strings ("18", "10.1"); coerce so recharts
  // scales the Y-axis numerically instead of lexically (the cause of bars overflowing the plot).
  const chartData = data.map((d) => ({ ...d, value: Number(d.value) || 0 }));
  // Bars sit on a 0 baseline; area/line charts auto-zoom to the data band so small climbs
  // (e.g. block height ticking up by a few hundred) are actually visible.
  const vals = chartData.map((d) => d.value).filter((v) => Number.isFinite(v));
  const dmin = vals.length ? Math.min(...vals) : 0;
  const dmax = vals.length ? Math.max(...vals) : 1;
  const pad = (dmax - dmin) * 0.12 || Math.max(1, Math.abs(dmax) * 0.04);
  const yDomain: [number, number] =
    type === "bar"
      ? [0, dmax > 0 ? Math.ceil(dmax * 1.15) : 1]
      : [Math.floor(dmin - pad), Math.ceil(dmax + pad)];

  const c = chartColor(color, light);
  const gridStroke = light ? "#e2e2e6" : "#27272a";
  const tickFill = light ? "#52525b" : "#71717a";
  const barCursor = light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.07)";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
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
          width={50}
          domain={yDomain}
          allowDecimals={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
        />
        <Tooltip
          content={<CustomTooltip unit={unit} />}
          cursor={type === "bar" ? { fill: barCursor } : false}
        />
        {type === "bar" ? (
          <Bar dataKey="value" fill={c} fillOpacity={light ? 0.85 : 0.6} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        ) : (
          <Area
            type="monotone"
            dataKey="value"
            stroke={c}
            strokeWidth={2}
            fill={c}
            fillOpacity={light ? 0.1 : 0.06}
            dot={false}
            isAnimationActive={false}
          />
        )}
      </ChartComponent>
    </ResponsiveContainer>
  );
}
