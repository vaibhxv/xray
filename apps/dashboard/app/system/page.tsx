'use client';

import { useEffect, useRef, useState } from 'react';
import { useWsEvent } from '@/lib/ws';
import { EChart } from '@/components/EChart';
import { StatCard } from '@/components/StatCard';
import { formatBytes } from '@/lib/format';
import type { EChartsOption } from 'echarts';
import type { SystemMetrics } from '@xray/shared';

const MAX_POINTS = 60;

function lineOption(
  title: string,
  data: [string, number][],
  unit: string,
  color: string,
): EChartsOption {
  return {
    title: { text: title, textStyle: { fontSize: 12, color: '#94a3b8' } },
    grid: { left: 50, right: 16, top: 36, bottom: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: data.map((d) => d[0]), axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value} ${unit}` } },
    series: [
      { type: 'line', smooth: true, showSymbol: false, data: data.map((d) => d[1]), areaStyle: { opacity: 0.15 }, itemStyle: { color }, lineStyle: { color } },
    ],
  };
}

export default function SystemPage() {
  const metric = useWsEvent<SystemMetrics>('system');
  const [history, setHistory] = useState<SystemMetrics[]>([]);
  const ref = useRef<SystemMetrics[]>([]);

  useEffect(() => {
    if (!metric) return;
    ref.current = [...ref.current, metric].slice(-MAX_POINTS);
    setHistory([...ref.current]);
  }, [metric]);

  const t = (m: SystemMetrics) => new Date(m.ts).toLocaleTimeString();

  const cpu = history.map((m) => [t(m), m.cpuPercent] as [string, number]);
  const ram = history.map((m) => [t(m), Math.round((m.ramUsedBytes / (m.ramTotalBytes || 1)) * 100)] as [string, number]);
  const temp = history.map((m) => [t(m), m.temperatureC ?? 0] as [string, number]);
  const disk = history.map((m) => [t(m), Math.round((m.diskUsedBytes / (m.diskTotalBytes || 1)) * 100)] as [string, number]);
  const net = history.map((m) => [t(m), Math.round(((m.netRxBytesPerSec + m.netTxBytesPerSec) / 1024) * 10) / 10] as [string, number]);
  const throughput = history.map((m) => [t(m), m.crawlThroughputPerMin] as [string, number]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">System Metrics</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="CPU" value={`${metric?.cpuPercent ?? 0}%`} />
        <StatCard label="Temperature" value={metric?.temperatureC != null ? `${metric.temperatureC}°C` : 'n/a'} />
        <StatCard label="RAM" value={`${formatBytes(metric?.ramUsedBytes)} / ${formatBytes(metric?.ramTotalBytes)}`} />
        <StatCard label="Disk" value={`${formatBytes(metric?.diskUsedBytes)} / ${formatBytes(metric?.diskTotalBytes)}`} />
        <StatCard label="PostgreSQL size" value={formatBytes(metric?.postgresSizeBytes)} />
        <StatCard label="Crawl throughput" value={`${metric?.crawlThroughputPerMin ?? 0}/min`} />
        <StatCard label="Network" value={`${formatBytes((metric?.netRxBytesPerSec ?? 0) + (metric?.netTxBytesPerSec ?? 0))}/s`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><EChart option={lineOption('CPU %', cpu, '%', '#38bdf8')} /></div>
        <div className="card"><EChart option={lineOption('RAM %', ram, '%', '#a78bfa')} /></div>
        <div className="card"><EChart option={lineOption('Temperature °C', temp, '°C', '#f87171')} /></div>
        <div className="card"><EChart option={lineOption('Disk %', disk, '%', '#34d399')} /></div>
        <div className="card"><EChart option={lineOption('Network KB/s', net, 'KB/s', '#fbbf24')} /></div>
        <div className="card"><EChart option={lineOption('Crawl throughput /min', throughput, '/m', '#22d3ee')} /></div>
      </div>

      {history.length === 0 && (
        <p className="text-sm text-slate-500">Waiting for live system metrics from the API…</p>
      )}
    </div>
  );
}
