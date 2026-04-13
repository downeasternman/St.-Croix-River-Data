import "./style.css";
import {
  SITE_DISCHARGE,
  SITE_TEMP,
  PARAM_DISCHARGE,
  PARAM_TEMP_C,
  ivUrl,
  statUrl,
  fetchIv,
  fetchStatRdb,
  celsiusToFahrenheit,
  buildHistOverlay,
  validateCustomRange,
  type IvRequest,
  type PresetPeriod,
} from "./usgs";
import { decimateIvPoints, renderDischargeChart, renderTemperatureChart } from "./charts";
import type { Chart } from "chart.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

app.innerHTML = `
  <header class="app-header">
    <h1>St. Croix River</h1>
    <p class="tagline">USGS discharge & water temperature</p>
  </header>

  <section class="controls" aria-label="Time range">
    <div class="presets">
      <span class="label">Range</span>
      <button type="button" class="chip" data-period="P1D">1 day</button>
      <button type="button" class="chip chip-active" data-period="P7D">7 days</button>
      <button type="button" class="chip" data-period="P30D">30 days</button>
    </div>
    <div class="custom-range">
      <span class="label">Custom</span>
      <input type="date" id="startDate" aria-label="Start date" />
      <span class="dash">–</span>
      <input type="date" id="endDate" aria-label="End date" />
      <button type="button" class="btn-apply" id="applyCustom">Apply</button>
    </div>
    <p class="range-summary" id="rangeSummary"></p>
    <p class="form-error" id="formError" role="alert" hidden></p>
  </section>

  <main class="cards">
    <article class="card" id="cardQ">
      <header>
        <h2>Discharge</h2>
        <p class="meta" id="metaQ"></p>
      </header>
      <div class="chart-wrap">
        <div class="loading" id="loadQ">Loading…</div>
        <canvas id="chartQ" height="220"></canvas>
      </div>
      <p class="footnote" id="footQ"></p>
      <p class="hist-note" id="histNoteQ" hidden></p>
    </article>

    <article class="card" id="cardT">
      <header>
        <h2>Water temperature</h2>
        <p class="meta" id="metaT"></p>
      </header>
      <div class="chart-wrap">
        <div class="loading" id="loadT">Loading…</div>
        <canvas id="chartT" height="220"></canvas>
      </div>
      <p class="footnote" id="footT"></p>
      <p class="hist-note" id="histNoteT" hidden></p>
    </article>
  </main>

  <footer class="app-footer">
    <p>Data: U.S. Geological Survey. IV: recent measurements; statistics: long-term daily means by calendar date where available.</p>
  </footer>
`;

let currentReq: IvRequest = { kind: "preset", period: "P7D" };
let chartQ: Chart<"line"> | null = null;
let chartT: Chart<"line"> | null = null;

const el = {
  rangeSummary: document.getElementById("rangeSummary")!,
  formError: document.getElementById("formError")!,
  chartQ: document.getElementById("chartQ") as HTMLCanvasElement,
  chartT: document.getElementById("chartT") as HTMLCanvasElement,
  loadQ: document.getElementById("loadQ")!,
  loadT: document.getElementById("loadT")!,
  metaQ: document.getElementById("metaQ")!,
  metaT: document.getElementById("metaT")!,
  footQ: document.getElementById("footQ")!,
  footT: document.getElementById("footT")!,
  histNoteQ: document.getElementById("histNoteQ")!,
  histNoteT: document.getElementById("histNoteT")!,
  startDate: document.getElementById("startDate") as HTMLInputElement,
  endDate: document.getElementById("endDate") as HTMLInputElement,
};

function setBusy(busy: boolean) {
  el.loadQ.hidden = !busy;
  el.loadT.hidden = !busy;
  el.chartQ.style.opacity = busy ? "0.25" : "1";
  el.chartT.style.opacity = busy ? "0.25" : "1";
}

function destroyCharts() {
  chartQ?.destroy();
  chartT?.destroy();
  chartQ = null;
  chartT = null;
}

function updatePresetUi(period: PresetPeriod) {
  document.querySelectorAll(".chip").forEach((b) => {
    const p = b.getAttribute("data-period");
    b.classList.toggle("chip-active", p === period);
  });
}

function summarizeRange() {
  if (currentReq.kind === "preset") {
    const labels: Record<PresetPeriod, string> = {
      P1D: "Last 24 hours",
      P7D: "Last 7 days",
      P30D: "Last 30 days",
    };
    el.rangeSummary.textContent = labels[currentReq.period];
  } else {
    const a = currentReq.start.toLocaleDateString();
    const b = currentReq.end.toLocaleDateString();
    el.rangeSummary.textContent = `${a} — ${b}`;
  }
}

async function load() {
  el.formError.hidden = true;
  setBusy(true);
  destroyCharts();
  summarizeRange();

  el.metaQ.textContent = `Site ${SITE_DISCHARGE} · ${el.rangeSummary.textContent}`;
  el.metaT.textContent = `Site ${SITE_TEMP} · ${el.rangeSummary.textContent}`;
  el.footQ.textContent = "";
  el.footT.textContent = "";
  el.histNoteQ.hidden = true;
  el.histNoteT.hidden = true;

  try {
    const uQ = ivUrl(SITE_DISCHARGE, PARAM_DISCHARGE, currentReq);
    const uT = ivUrl(SITE_TEMP, PARAM_TEMP_C, currentReq);

    const [parsedQ, parsedT, statQ, statT] = await Promise.all([
      fetchIv(uQ),
      fetchIv(uT),
      fetchStatRdb(statUrl(SITE_DISCHARGE, PARAM_DISCHARGE)).catch(() => new Map<string, number>()),
      fetchStatRdb(statUrl(SITE_TEMP, PARAM_TEMP_C)).catch(() => new Map<string, number>()),
    ]);

    const ptsQ = decimateIvPoints(parsedQ.points);
    const ptsTRaw = decimateIvPoints(parsedT.points);
    const ptsT = ptsTRaw.map((p) => ({
      t: p.t,
      value: celsiusToFahrenheit(p.value),
    }));

    const histQ = buildHistOverlay(ptsQ, statQ, (v) => v);
    const histT = buildHistOverlay(ptsT, statT, (c) => celsiusToFahrenheit(c));

    if (histQ.length === 0 && statQ.size === 0) {
      el.histNoteQ.textContent =
        "Historical average line not shown (no statistics returned for discharge at this site).";
      el.histNoteQ.hidden = false;
    } else if (histQ.length === 0) {
      el.histNoteQ.textContent =
        "Historical daily mean from USGS did not align with these timestamps.";
      el.histNoteQ.hidden = false;
    }

    if (histT.length === 0 && statT.size === 0) {
      el.histNoteT.textContent =
        "Historical average line not shown (no statistics returned for temperature at this site).";
      el.histNoteT.hidden = false;
    } else if (histT.length === 0) {
      el.histNoteT.textContent =
        "Historical daily mean from USGS did not align with these timestamps.";
      el.histNoteT.hidden = false;
    }

    if (ptsQ.length === 0) {
      el.footQ.textContent = "No discharge data in this window (maintenance or outages).";
    } else {
      const last = parsedQ.lastQualifierCodes?.length
        ? ` · Codes: ${parsedQ.lastQualifierCodes.join(", ")}`
        : "";
      el.footQ.textContent = `Points: ${parsedQ.points.length}${last}`;
    }

    if (ptsT.length === 0) {
      el.footT.textContent = "No temperature data in this window.";
    } else {
      const last = parsedT.lastQualifierCodes?.length
        ? ` · Codes: ${parsedT.lastQualifierCodes.join(", ")}`
        : "";
      el.footT.textContent = `Sensor reports °C; chart is °F.${last}`;
    }

    chartQ = renderDischargeChart(el.chartQ, ptsQ, histQ);
    chartT = renderTemperatureChart(el.chartT, ptsT, histT);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    el.formError.textContent = msg;
    el.formError.hidden = false;
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const p = btn.getAttribute("data-period") as PresetPeriod;
    currentReq = { kind: "preset", period: p };
    updatePresetUi(p);
    void load();
  });
});

document.getElementById("applyCustom")?.addEventListener("click", () => {
  const start = new Date(el.startDate.value + "T12:00:00");
  const end = new Date(el.endDate.value + "T12:00:00");
  const err = validateCustomRange(start, end);
  if (err) {
    el.formError.textContent = err;
    el.formError.hidden = false;
    return;
  }
  currentReq = { kind: "range", start, end };
  document.querySelectorAll(".chip").forEach((b) => b.classList.remove("chip-active"));
  void load();
});

const today = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
el.endDate.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const weekAgo = new Date(today);
weekAgo.setDate(weekAgo.getDate() - 7);
el.startDate.value = `${weekAgo.getFullYear()}-${pad(weekAgo.getMonth() + 1)}-${pad(weekAgo.getDate())}`;

updatePresetUi("P7D");
void load();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
