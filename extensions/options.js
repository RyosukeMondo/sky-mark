/**
 * Options page logic for Sky-Mark Flight History extension.
 *
 * Handles UI rendering: flight table, monthly breakdown, fee breakdown,
 * CSV/JSON export, and communication with background service worker.
 */

// ── DOM References ──────────────────────────────────────────

const yearSelect = document.getElementById("year-select");
const extractBtn = document.getElementById("extract-btn");
const csvBtn = document.getElementById("csv-btn");
const jsonBtn = document.getElementById("json-btn");
const statusEl = document.getElementById("status");
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");
const resultsSection = document.getElementById("results");
const metaInfo = document.getElementById("meta-info");
const flightTbody = document.getElementById("flight-tbody");
const flightTfoot = document.getElementById("flight-tfoot");
const monthlyTbody = document.getElementById("monthly-tbody");
const monthlyTfoot = document.getElementById("monthly-tfoot");
const feeTbody = document.getElementById("fee-tbody");
const feeTfoot = document.getElementById("fee-tfoot");

let currentData = null;

// ── Initialization ──────────────────────────────────────────

function initYearSelector() {
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = `${y}年`;
    yearSelect.appendChild(opt);
  }
}

function init() {
  initYearSelector();
  extractBtn.addEventListener("click", onExtract);
  csvBtn.addEventListener("click", onCsvDownload);
  jsonBtn.addEventListener("click", onJsonDownload);
  yearSelect.addEventListener("change", onYearChange);

  // Try loading existing data for selected year
  loadStoredData(yearSelect.value);
}

// ── Event Handlers ──────────────────────────────────────────

function onExtract() {
  const year = yearSelect.value;
  extractBtn.disabled = true;
  setStatus("Sending extraction request...", "");
  showProgress(0);

  chrome.runtime.sendMessage(
    { type: "TRIGGER_EXTRACT", year },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus(
          `Error: ${chrome.runtime.lastError.message}`,
          "error"
        );
        extractBtn.disabled = false;
        hideProgress();
      }
    }
  );
}

function onYearChange() {
  loadStoredData(yearSelect.value);
}

function onCsvDownload() {
  if (!currentData) return;
  const csv = generateCsv(currentData.reservations);
  downloadFile(
    csv,
    `flight_history_${currentData.year}.csv`,
    "text/csv;charset=utf-8-sig"
  );
}

function onJsonDownload() {
  if (!currentData) return;
  const json = JSON.stringify(currentData.reservations, null, 2);
  downloadFile(
    json,
    `flight_history_${currentData.year}.json`,
    "application/json;charset=utf-8"
  );
}

// ── Data Loading ────────────────────────────────────────────

function loadStoredData(year) {
  chrome.runtime.sendMessage(
    { type: "GET_DATA", year },
    (response) => {
      if (response && response.data) {
        currentData = response.data;
        renderAll(currentData);
      } else {
        currentData = null;
        resultsSection.hidden = true;
        csvBtn.disabled = true;
        jsonBtn.disabled = true;
      }
    }
  );
}

// ── Message Listener ────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATUS") {
    setStatus(msg.message, "");
    if (msg.progress !== null && msg.progress !== undefined) {
      showProgress(msg.progress);
    }
  }

  if (msg.type === "ERROR") {
    setStatus(`Error: ${msg.error}`, "error");
    extractBtn.disabled = false;
    hideProgress();
  }

  if (msg.type === "DATA_READY") {
    setStatus("Data ready. Loading results...", "success");
    hideProgress();
    extractBtn.disabled = false;
    loadStoredData(msg.year);
  }
});

// ── Status & Progress ───────────────────────────────────────

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = "status" + (type ? ` ${type}` : "");
}

function showProgress(pct) {
  progressContainer.hidden = false;
  progressBar.style.width = `${pct}%`;
}

function hideProgress() {
  progressContainer.hidden = true;
  progressBar.style.width = "0%";
}

// ── Rendering ───────────────────────────────────────────────

function renderAll(data) {
  resultsSection.hidden = false;
  csvBtn.disabled = false;
  jsonBtn.disabled = false;

  renderMeta(data);
  renderFlightTable(data.reservations);
  renderMonthlyTable(data.reservations);
  renderFeeTable(data.reservations);
}

function renderMeta(data) {
  const res = data.reservations;
  let name = "";
  if (res.length > 0 && res[0].lastname_alphabet) {
    name = `${res[0].lastname_alphabet} ${res[0].firstname_alphabet}`;
  }
  const today = new Date().toISOString().slice(0, 10);
  metaInfo.textContent = name
    ? `${data.year}年 | 搭乗者: ${name} | 生成日: ${today}`
    : `${data.year}年 | 生成日: ${today}`;
}

function renderFlightTable(reservations) {
  flightTbody.innerHTML = "";
  flightTfoot.innerHTML = "";

  let flightNo = 0;
  let grandTotal = 0;
  let resCount = 0;

  for (const res of reservations) {
    const feesTotal = (res.fees || []).reduce(
      (s, f) => s + f.subtotal,
      0
    );

    const allFares = [];
    for (const pax of res.passengers || []) {
      for (const fare of pax.fares || []) {
        allFares.push(fare);
      }
    }

    if (allFares.length === 0) continue;

    let first = true;
    resCount++;

    for (const fare of allFares) {
      flightNo++;
      const fi = (res.flights || []).find(
        (f) => f.flight === fare.flight
      );
      const date = fi ? fi.date : "";
      const aircraft = fi
        ? (fi.aircraft || "").slice(0, 4)
        : "";
      const route = fi ? `${fi.dep} -> ${fi.arr}` : "";

      const tr = document.createElement("tr");
      if (first) {
        tr.className = "pnr-border";
      }

      let feesStr = "";
      let totalStr = "";
      let pnrStr = "";

      if (first) {
        feesStr = feesTotal ? formatYen(feesTotal) : "-";
        totalStr = formatYen(res.total);
        pnrStr = res.pnr;
        grandTotal += res.total;
        first = false;
      }

      tr.innerHTML =
        `<td class="num">${flightNo}</td>` +
        `<td>${escHtml(date)}</td>` +
        `<td>${escHtml(fare.flight)}</td>` +
        `<td>${escHtml(aircraft)}</td>` +
        `<td>${escHtml(route)}</td>` +
        `<td>${escHtml(fare.fare_type)}</td>` +
        `<td class="num">${formatYen(fare.amount)}</td>` +
        `<td>${escHtml(fare.seat)}</td>` +
        `<td class="num">${feesStr}</td>` +
        `<td class="num">${totalStr}</td>` +
        `<td>${escHtml(pnrStr)}</td>`;

      flightTbody.appendChild(tr);
    }

    // Show special fee breakdown rows
    const specialFees = (res.fees || []).filter(
      (f) => f.type !== "手荷物料金等"
    );
    for (const sf of specialFees) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td colspan="8"></td>` +
        `<td class="fee-detail" colspan="3">` +
        `${escHtml(sf.type)}: ${formatYen(sf.unit_price)} x ${sf.quantity}` +
        `</td>`;
      flightTbody.appendChild(tr);
    }
  }

  const tfootRow = document.createElement("tr");
  tfootRow.innerHTML =
    `<td colspan="6" style="text-align:right">` +
    `合計: ${flightNo}フライト / ${resCount}予約</td>` +
    `<td class="num" colspan="3"></td>` +
    `<td class="num">${formatYen(grandTotal)}</td>` +
    `<td></td>`;
  flightTfoot.appendChild(tfootRow);
}

function renderMonthlyTable(reservations) {
  monthlyTbody.innerHTML = "";
  monthlyTfoot.innerHTML = "";

  const monthly = {};
  for (const res of reservations) {
    if (!res.flights || res.flights.length === 0) continue;
    const m = res.flights[0].date.match(/(\d+)月/);
    if (!m) continue;
    const month = parseInt(m[1], 10);
    if (!monthly[month]) {
      monthly[month] = { flights: 0, amount: 0 };
    }
    const fareCount = (res.passengers || []).reduce(
      (s, p) => s + (p.fares || []).length,
      0
    );
    monthly[month].flights += fareCount;
    monthly[month].amount += res.total;
  }

  let totalF = 0;
  let totalA = 0;
  const sortedMonths = Object.keys(monthly)
    .map(Number)
    .sort((a, b) => a - b);

  for (const month of sortedMonths) {
    const d = monthly[month];
    totalF += d.flights;
    totalA += d.amount;
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${month}月</td>` +
      `<td class="num">${d.flights}</td>` +
      `<td class="num">${formatYen(d.amount)}</td>`;
    monthlyTbody.appendChild(tr);
  }

  const tfootRow = document.createElement("tr");
  tfootRow.innerHTML =
    `<td>合計</td>` +
    `<td class="num">${totalF}</td>` +
    `<td class="num">${formatYen(totalA)}</td>`;
  monthlyTfoot.appendChild(tfootRow);
}

function renderFeeTable(reservations) {
  feeTbody.innerHTML = "";
  feeTfoot.innerHTML = "";

  const feeTypes = {};
  let fareTotal = 0;

  for (const res of reservations) {
    for (const fee of res.fees || []) {
      feeTypes[fee.type] = (feeTypes[fee.type] || 0) + fee.subtotal;
    }
    for (const pax of res.passengers || []) {
      for (const f of pax.fares || []) {
        fareTotal += f.amount;
      }
    }
  }

  // Fare total row
  const fareTr = document.createElement("tr");
  fareTr.innerHTML =
    `<td>運賃合計</td>` +
    `<td class="num">${formatYen(fareTotal)}</td>`;
  feeTbody.appendChild(fareTr);

  // Each fee type sorted by amount descending
  const sorted = Object.entries(feeTypes).sort((a, b) => b[1] - a[1]);
  for (const [type, amount] of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escHtml(type)}</td>` +
      `<td class="num">${formatYen(amount)}</td>`;
    feeTbody.appendChild(tr);
  }

  const grand = reservations.reduce((s, r) => s + r.total, 0);
  const tfootRow = document.createElement("tr");
  tfootRow.innerHTML =
    `<td>総合計</td>` +
    `<td class="num">${formatYen(grand)}</td>`;
  feeTfoot.appendChild(tfootRow);
}

// ── CSV Generation ──────────────────────────────────────────

function generateCsv(reservations) {
  const BOM = "\uFEFF";
  const headers = [
    "#", "PNR", "搭乗日", "便名", "機材", "出発地", "出発時間",
    "到着地", "到着時間", "運賃種別", "運賃額", "座席", "座席指定料金",
    "搭乗者種別", "搭乗者名", "年齢", "性別",
    "手荷物料金等", "座席指定料金(計)", "その他費用", "諸費用計", "予約合計",
    "支払状態", "支払方法",
    "電話番号", "メールアドレス", "予約番号",
  ];

  const rows = [headers.map(csvEscape).join(",")];
  let no = 0;

  for (const res of reservations) {
    const feesTotal = (res.fees || []).reduce(
      (s, f) => s + f.subtotal,
      0
    );
    const feeByType = {};
    for (const fee of res.fees || []) {
      feeByType[fee.type] = (feeByType[fee.type] || 0) + fee.subtotal;
    }
    const baggage = feeByType["手荷物料金等"] || 0;
    const seatFee = feeByType["座席指定料金"] || 0;
    const otherFees = feesTotal - baggage - seatFee;

    let firstRes = true;
    for (const pax of res.passengers || []) {
      let firstPax = true;
      for (const fare of pax.fares || []) {
        no++;
        const fi = (res.flights || []).find(
          (fl) => fl.flight === fare.flight
        );
        const row = [
          no,
          firstRes ? res.pnr : "",
          fi ? fi.date : "",
          fare.flight,
          fi ? fi.aircraft || "" : "",
          fi ? fi.dep : "",
          fi ? fi.dep_time : "",
          fi ? fi.arr : "",
          fi ? fi.arr_time : "",
          fare.fare_type,
          fare.amount,
          fare.seat,
          fare.seat_fee,
          firstPax ? pax.type : "",
          firstPax ? pax.name : "",
          firstPax ? pax.age : "",
          firstPax ? pax.gender : "",
          firstRes ? baggage : "",
          firstRes ? seatFee : "",
          firstRes && otherFees ? otherFees : "",
          firstRes ? feesTotal : "",
          firstRes ? res.total : "",
          firstRes ? res.payment_status || "" : "",
          firstRes
            ? (res.payment_methods || []).join("/")
            : "",
          firstRes ? res.phone_number || "" : "",
          firstRes ? res.email || "" : "",
          fi ? fi.res_no : "",
        ];
        rows.push(row.map(csvEscape).join(","));
        firstRes = false;
        firstPax = false;
      }
    }
  }

  return BOM + rows.join("\r\n");
}

function csvEscape(val) {
  const s = String(val == null ? "" : val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── Utilities ───────────────────────────────────────────────

function formatYen(amount) {
  if (amount == null || amount === 0) return "";
  return amount.toLocaleString("ja-JP") + "円";
}

function escHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Boot ────────────────────────────────────────────────────

init();
