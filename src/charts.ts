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

/** Line segment color vs 70°F: cooler → deeper blue; ~neutral at 70; warmer → coral/red. */
export function tempSegmentColor(fahrenheit: number): string {
  if (!Number.isFinite(fahrenheit)) return "rgb(148, 163, 184)";
  if (fahrenheit >= 70) {
    const t = Math.min(1, Math.max(0, (fahrenheit - 70) / 30));
    if (t < 0.45) return lerpColor([94, 234, 212], [251, 146, 60], t / 0.45);
    return lerpColor([251, 146, 60], [239, 68, 68], (t - 0.45) / 0.55);
  }
  const depth = Math.min(1, Math.max(0, (70 - fahrenheit) / 45));
  return lerpColor([15, 23, 74], [56, 189, 248], depth);
}

function timeChartOptions(yAxisTitle: string): ChartOptions<"line"> {
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
      x: {
        type: "time",
        time: { tooltipFormat: "MMM d, h:mm a" },
        grid: { color: "rgba(15, 23, 42, 0.06)" },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: {
        grid: { color: "rgba(15, 23, 42, 0.06)" },
        title: {
          display: true,
          text: yAxisTitle,
          color: "rgb(71, 85, 105)",
        },
      },
    },
  };
}

export function renderDischargeChart(
  canvas: HTMLCanvasElement,
  points: IvPoint[],
  hist: { x: Date; y: number }[]
): Chart<"line"> {
  const main = points.map((p) => ({ x: p.t.getTime(), y: p.value }));
  const histPts = hist.map((h) => ({ x: h.x.getTime(), y: h.y }));

  const datasets: ChartDataset<"line">[] = [
    {
      type: "line",
      label: "Discharge",
      data: main,
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

  return new Chart(canvas, {
    type: "line",
    data: { datasets },
    options: timeChartOptions("ft³/s"),
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

  return new Chart(canvas, {
    type: "line",
    data: { datasets },
    options: timeChartOptions("°F (tint vs 70°F comfort)"),
  });
}
