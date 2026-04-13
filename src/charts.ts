import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import type { ChartDataset, ChartOptions } from "chart.js";
import "chartjs-adapter-date-fns";
import type { IvPoint } from "./usgs";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler
);

const MAX_POINTS = 3500;

/** US gallons per cubic foot (exact definition used by USGS conversions). */
export const GAL_PER_CUBIC_FOOT = 7.48051948;

export function decimateIvPoints(points: IvPoint[]): IvPoint[] {
  if (points.length <= MAX_POINTS) return points;
  const step = Math.ceil(points.length / MAX_POINTS);
  const out: IvPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1]?.t.getTime() !== last?.t.getTime()) out.push(last);
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): string {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r},${g},${b})`;
}

/** Color by water temperature (°F): bluer when colder, warmer tones when hotter. */
export function tempSegmentColor(fahrenheit: number): string {
  if (!Number.isFinite(fahrenheit)) return "rgb(148, 163, 184)";
  const stops: [number, [number, number, number]][] = [
    [26, [8, 25, 85]],
    [36, [20, 55, 150]],
    [46, [40, 110, 210]],
    [56, [70, 150, 235]],
    [65, [110, 185, 255]],
    [72, [160, 215, 255]],
    [78, [210, 220, 200]],
    [84, [255, 200, 120]],
    [90, [250, 140, 80]],
    [98, [220, 50, 45]],
  ];
  const t = Math.min(stops[stops.length - 1]![0], Math.max(stops[0]![0], fahrenheit));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]!;
    const [t1, c1] = stops[i + 1]!;
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / (t1 - t0 || 1);
      return lerpColor(c0, c1, u);
    }
  }
  const last = stops[stops.length - 1]![1];
  return lerpColor(last, last, 0);
}

function formatFlowTooltip(cfs: number, labelPrefix: string): string {
  const gal = cfs * GAL_PER_CUBIC_FOOT;
  const cfsStr = cfs.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const galStr = gal.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${labelPrefix}: ${cfsStr} ft³/s · ${galStr} US gal/s`;
}

function formatGalTick(galPerSec: number): string {
  const n = Number(galPerSec);
  if (!Number.isFinite(n)) return "";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
}

function timeScaleBase(): ChartOptions<"line">["scales"] {
  return {
    x: {
      type: "time",
      time: { tooltipFormat: "MMM d, h:mm a" },
      grid: { color: "rgba(15, 23, 42, 0.06)" },
      ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
  };
}

function temperatureChartOptions(): ChartOptions<"line"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: { boxWidth: 12, usePointStyle: true },
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            const x = items[0]?.parsed.x;
            if (typeof x === "number")
              return new Date(x).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
            return "";
          },
        },
      },
    },
    scales: {
      ...timeScaleBase(),
      y: {
        grid: { color: "rgba(15, 23, 42, 0.06)" },
        title: {
          display: true,
          text: "°F (line color by temperature: colder = bluer)",
          color: "rgb(71, 85, 105)",
        },
      },
    },
  };
}

function flowExtents(points: IvPoint[], hist: { x: Date; y: number }[]): {
  min: number;
  max: number;
} {
  const vals: number[] = [];
  for (const p of points) vals.push(p.value);
  for (const h of hist) vals.push(h.y);
  if (vals.length === 0) return { min: 0, max: 1 };
  let vmin = Math.min(...vals);
  let vmax = Math.max(...vals);
  const span = Math.max(vmax - vmin, Math.abs(vmax) * 0.02, 1e-6);
  const pad = span * 0.08;
  return { min: vmin - pad, max: vmax + pad };
}

export function renderFlowChart(
  canvas: HTMLCanvasElement,
  points: IvPoint[],
  hist: { x: Date; y: number }[]
): Chart<"line"> {
  const main = points.map((p) => ({ x: p.t.getTime(), y: p.value }));
  const histPts = hist.map((h) => ({ x: h.x.getTime(), y: h.y }));

  const datasets: ChartDataset<"line">[] = [
    {
      type: "line",
      label: "Flow",
      data: main,
      yAxisID: "y",
      borderColor: "rgb(37, 99, 235)",
      backgroundColor: "rgba(37, 99, 235, 0.08)",
      fill: true,
      tension: 0.12,
      pointRadius: 0,
      borderWidth: 2,
    },
  ];

  if (histPts.length > 0) {
    datasets.push({
      type: "line",
      label: "Historical daily mean (same calendar date)",
      data: histPts,
      yAxisID: "y",
      borderColor: "rgb(148, 163, 184)",
      backgroundColor: "transparent",
      borderDash: [6, 4],
      fill: false,
      tension: 0.12,
      pointRadius: 0,
      borderWidth: 2,
      spanGaps: true,
    });
  }

  const { min: cfsMin, max: cfsMax } = flowExtents(points, hist);

  return new Chart<"line">(canvas, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const x = items[0]?.parsed.x;
              if (typeof x === "number")
                return new Date(x).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                });
              return "";
            },
            label: (ctx) => {
              const cfs = ctx.parsed.y;
              if (cfs == null) return "";
              const label = String(ctx.dataset.label ?? "");
              if (label === "Flow")
                return formatFlowTooltip(cfs, "Flow");
              if (label.includes("Historical"))
                return formatFlowTooltip(cfs, "Historical mean");
              return label;
            },
          },
        },
      },
      scales: {
        ...timeScaleBase(),
        y: {
          type: "linear",
          min: cfsMin,
          max: cfsMax,
          grid: { color: "rgba(15, 23, 42, 0.06)" },
          title: {
            display: true,
            text: "Flow (ft³/s)",
            color: "rgb(71, 85, 105)",
          },
        },
        y1: {
          type: "linear",
          position: "right",
          min: cfsMin * GAL_PER_CUBIC_FOOT,
          max: cfsMax * GAL_PER_CUBIC_FOOT,
          grid: { display: false },
          title: {
            display: true,
            text: "Flow (US gal/s)",
            color: "rgb(71, 85, 105)",
          },
          ticks: {
            callback: (raw) =>
              typeof raw === "number" ? formatGalTick(raw) : "",
          },
        },
      },
    },
  });
}

export function renderTemperatureChart(
  canvas: HTMLCanvasElement,
  pointsF: IvPoint[],
  histF: { x: Date; y: number }[]
): Chart<"line"> {
  const main = pointsF.map((p) => ({ x: p.t.getTime(), y: p.value }));
  const histPts = histF.map((h) => ({ x: h.x.getTime(), y: h.y }));

  const datasets: ChartDataset<"line">[] = [
    {
      type: "line",
      label: "Water temperature",
      data: main,
      fill: false,
      tension: 0.15,
      pointRadius: 0,
      borderWidth: 3,
      borderColor: "rgba(0,0,0,0)",
      segment: {
        borderColor: (ctx) => {
          const y0 = ctx.p0.parsed.y;
          const y1 = ctx.p1.parsed.y;
          if (y0 == null || y1 == null) return "rgb(148, 163, 184)";
          const mid = (Number(y0) + Number(y1)) / 2;
          return tempSegmentColor(mid);
        },
      },
    },
  ];

  if (histPts.length > 0) {
    datasets.push({
      type: "line",
      label: "Historical daily mean (same calendar date)",
      data: histPts,
      borderColor: "rgb(100, 116, 139)",
      backgroundColor: "transparent",
      borderDash: [6, 4],
      fill: false,
      tension: 0.15,
      pointRadius: 0,
      borderWidth: 2,
      spanGaps: true,
    });
  }

  return new Chart<"line">(canvas, {
    type: "line",
    data: { datasets },
    options: temperatureChartOptions(),
  });
}
