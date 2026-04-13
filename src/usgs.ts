/** NWIS site and parameter codes */
export const SITE_DISCHARGE = "01021000";
export const SITE_TEMP = "01021050";
export const PARAM_DISCHARGE = "00060";
export const PARAM_TEMP_C = "00010";

const IV_SENTINELS = new Set([
  "-999999",
  "-999999.0",
  "Ice",
  "Bld",
  "Wndw",
  "Ssn",
  "",
]);

const MAX_IV_RANGE_DAYS = 1095;

export type PresetPeriod = "P1D" | "P7D" | "P30D";

export type IvRequest =
  | { kind: "preset"; period: PresetPeriod }
  | { kind: "range"; start: Date; end: Date };

/** Paths like `/iv/?q=…` or `/stat/?q=…` (after `/nwis`). Dev proxy maps `/usgs-nwis` → `/nwis` upstream. */
function nwisPath(path: string): string {
  if (import.meta.env.DEV) return `/usgs-nwis${path}`;
  return `https://waterservices.usgs.gov/nwis${path}`;
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

export function ivUrl(
  site: string,
  parameterCd: string,
  req: IvRequest
): string {
  const params = new URLSearchParams({
    format: "json",
    sites: site,
    parameterCd,
  });
  if (req.kind === "preset") {
    params.set("period", req.period);
  } else {
    params.set("startDT", formatDt(req.start));
    params.set("endDT", formatDt(req.end));
  }
  const q = params.toString();
  return `${nwisPath(`/iv/?${q}`)}`;
}

function formatDt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function statUrl(site: string, parameterCd: string): string {
  const params = new URLSearchParams({
    format: "rdb",
    sites: site,
    parameterCd,
    statReportType: "daily",
    statType: "mean",
  });
  return `${nwisPath(`/stat/?${params.toString()}`)}`;
}

export interface IvPoint {
  t: Date;
  value: number;
}

export interface ParsedIv {
  points: IvPoint[];
  siteName?: string;
  lastQualifierCodes?: string[];
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseIvJson(text: string): ParsedIv {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { points: [] };
  }
  const root = data as {
    value?: {
      timeSeries?: Array<{
        sourceInfo?: { siteName?: string };
        values?: Array<{
          value?: Array<{
            value?: string | number;
            dateTime?: string;
            qualifiers?: Array<{ qualifierCode?: string }>;
          }>;
        }>;
      }>;
    };
  };
  const ts = root?.value?.timeSeries?.[0];
  if (!ts?.values?.[0]?.value) return { points: [], siteName: ts?.sourceInfo?.siteName };

  const raw = ts.values[0].value;
  const points: IvPoint[] = [];

  let lastCodes: string[] | undefined;
  for (const row of raw) {
    const sv = row?.value;
    const s = sv !== undefined && sv !== null ? String(sv).trim() : "";
    if (IV_SENTINELS.has(s)) continue;
    const y = asNumber(sv);
    if (y === null) continue;
    const dt = row?.dateTime ? new Date(row.dateTime) : null;
    if (!dt || Number.isNaN(dt.getTime())) continue;
    points.push({ t: dt, value: y });
    const q = row.qualifiers;
    if (q?.length) {
      lastCodes = q.map((x) => x.qualifierCode).filter(Boolean) as string[];
    }
  }
  points.sort((a, b) => a.t.getTime() - b.t.getTime());

  return {
    points,
    siteName: ts.sourceInfo?.siteName,
    lastQualifierCodes: lastCodes,
  };
}

/** Parse USGS stats RDB (tab-delimited); map month-day → mean value for that calendar day of year. */
export function parseStatRdb(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  let headers: string[] | null = null;
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (line.startsWith("agency_cd")) {
      headers = line.split("\t").map((s) => s.trim());
      continue;
    }
    if (/^5[sntr0-9]/i.test(line.split("\t")[0] ?? "")) continue;

    if (!headers) continue;
    const cols = line.split("\t");
    if (cols.length < headers.length * 0.8) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i]?.trim() ?? "";
    });
    const m = parseInt(row.month_nu ?? "", 10);
    const d = parseInt(row.day_nu ?? "", 10);
    const mv = parseFloat(row.mean_va ?? "");
    if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(mv)) continue;
    map.set(`${m}-${d}`, mv);
  }
  return map;
}

export function buildHistOverlay(
  mainPoints: IvPoint[],
  dayOfYearMeans: Map<string, number>,
  transform: (meanRaw: number) => number
): Array<{ x: Date; y: number }> {
  const out: Array<{ x: Date; y: number }> = [];
  for (const p of mainPoints) {
    const key = `${p.t.getMonth() + 1}-${p.t.getDate()}`;
    const raw = dayOfYearMeans.get(key);
    if (raw === undefined) continue;
    const y = transform(raw);
    if (!Number.isFinite(y)) continue;
    out.push({ x: p.t, y });
  }
  return out;
}

export function validateCustomRange(start: Date, end: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Start and end must be valid dates.";
  }
  if (end < start) return "End date must be on or after the start date.";
  const ms = end.getTime() - start.getTime();
  const days = ms / (86400 * 1000);
  if (days > MAX_IV_RANGE_DAYS) {
    return `USGS instantaneous data requests are limited to about ${MAX_IV_RANGE_DAYS} days—pick a shorter range.`;
  }
  return null;
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fetchIv(url: string): Promise<ParsedIv> {
  const text = await fetchText(url);
  return parseIvJson(text);
}

export async function fetchStatRdb(url: string): Promise<Map<string, number>> {
  const text = await fetchText(url);
  return parseStatRdb(text);
}
