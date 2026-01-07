// ==UserScript==
// @name         Planning Table – Import Planning Data (CSV + Urlaubstool-Konverter via Personalnummer=data-user-id)
// @namespace    https://tampermonkey.net/
// @version      2.8.0
// @author       Roman Allenstein <r.allenstein@reply.de>
// @description  Paste semicolon CSV. Supports direct format Personalnummer;Januar;...;Dezember. Also converts Urlaubstool CSV (Personalnummer;Vorname;Nachname;...;Von;Bis;...;Art;Anzahl der Arbeitstage). Matching is done by Personalnummer == data-user-id. Splits across months by WORKDAYS (Mon–Fri, German national public holidays, 24.12. & 31.12. count as 50%). Empty cells => 0. Shows overlay with users missing import data AND Urlaubstool rows without Personalnummer.
// @match        https://geco.reply.com/GeCoO/Project/ManagePlanning.aspx?*
// @run-at       document-end
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.planning-import.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.planning-import.user.js
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const BTN_ID = "tm-import-planning-data";
  const MODAL_ID = "tm-import-modal";
  const OVERLAY_ID = "tm-import-result-overlay";
  const URLAUB_ONLY_ABSENCE_TYPE = "erholungsurlaub";
  const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

  /* =============================================
     REUSABLE HELPERS - copy to other scripts
     ============================================= */
  const el = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => k === "text" ? e.textContent = v : k === "html" ? e.innerHTML = v : e.setAttribute(k, v));
    children.forEach(c => e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return e;
  };

  const addButtonAfter = (selector, btnAttrs, onClick) => {
    const anchor = document.querySelector(selector);
    if (!anchor || document.getElementById(btnAttrs.id)) return false;
    const btn = el("button", btnAttrs);
    if (onClick) btn.addEventListener("click", onClick);
    anchor.insertAdjacentElement("afterend", btn);
    return true;
  };
  /* ============================================= */

  // Inject styles once
  const style = document.createElement("style");
  style.textContent = `
    .tm-overlay{position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif}
    .tm-panel{background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);padding:16px 18px}
    .tm-panel h3{font-size:18px;font-weight:700;margin:0 0 10px}
    .tm-panel textarea{width:100%;height:320px;resize:vertical;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border:1px solid #ddd;border-radius:10px;outline:none}
    .tm-panel ul{margin:0 0 10px 18px;font-size:14px}
    .tm-row{display:flex;gap:10px;flex-wrap:wrap}
    .tm-row.between{justify-content:space-between}
    .tm-section{margin-top:10px}
    .tm-section b{display:block;margin-bottom:6px}
  `;
  document.head.appendChild(style);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || "").toString().trim().replace(/\s+/g, " ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const formatEU = n => (Number.isFinite(n) ? n : 0).toFixed(1).replace(".", ",");
  const parseNum = s => { const n = Number((s ?? "").toString().trim().replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const splitLine = l => l.split(l.includes(";") ? ";" : l.includes("\t") ? "\t" : ",").map(p => p.trim());

  // Date helpers (UTC)
  const ymd = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
  const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
  const parseDE = s => { const m = (s||"").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? new Date(Date.UTC(+m[3], +m[2]-1, +m[1])) : null; };

  function easterSunday(year) {
    const a=year%19, b=Math.floor(year/100), c=year%100, d=Math.floor(b/4), e=b%4;
    const f=Math.floor((b+8)/25), g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30;
    const i=Math.floor(c/4), k=c%4, l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451);
    const month=Math.floor((h+l-7*m+114)/31), day=((h+l-7*m+114)%31)+1;
    return new Date(Date.UTC(year, month-1, day));
  }

  const getHolidays = year => {
    const e = easterSunday(year);
    return new Set([
      new Date(Date.UTC(year,0,1)), new Date(Date.UTC(year,4,1)), new Date(Date.UTC(year,9,3)),
      new Date(Date.UTC(year,11,25)), new Date(Date.UTC(year,11,26)),
      addDays(e,-2), addDays(e,1), addDays(e,39), addDays(e,50)
    ].map(ymd));
  };
  const getHalfHolidays = year => new Set([ymd(new Date(Date.UTC(year,11,24))), ymd(new Date(Date.UTC(year,11,31)))]);

  function countWorkdays(from, to, holidays, halfHolidays) {
    const counts = new Array(12).fill(0);
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6 || holidays.get(d.getUTCFullYear())?.has(ymd(d))) continue;
      const half = halfHolidays.get(d.getUTCFullYear())?.has(ymd(d));
      counts[d.getUTCMonth()] += half ? 0.5 : 1;
    }
    return counts;
  }

  function distribute(monthCounts, total) {
    const sum = monthCounts.reduce((a,b) => a+b, 0);
    if (sum <= 0 || !total) return new Array(12).fill(0);
    const raw = monthCounts.map(c => Math.round(total * c / sum * 10) / 10);
    const diff = Math.round((total - raw.reduce((a,b)=>a+b,0)) * 10) / 10;
    if (diff) { const last = monthCounts.findLastIndex(c => c > 0); if (last >= 0) raw[last] += diff; }
    return raw;
  }

  // CSV parsing
  function parsePlanningCSV(text) {
    const map = new Map();
    const lines = (text || "").replace(/\r\n?/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return map;

    const first = splitLine(lines[0]);
    const h0 = norm(first[0]);
    const hasHeader = ["user","name","username","personalnummer","userid"].includes(h0) ||
      first.slice(1).some(p => ["jan","feb","mar","apr","mai","jun","jul","aug","sep","okt","nov","dez"].some(m => norm(p).startsWith(m)));
    const keyMode = ["personalnummer","userid","user-id","data-user-id"].includes(h0) ? "id" : ["user","name","username"].includes(h0) ? "name" : "auto";

    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
      const parts = splitLine(lines[i]);
      const keyRaw = (parts[0] || "").trim();
      if (!keyRaw) continue;
      const key = keyMode === "id" ? keyRaw : keyMode === "name" ? norm(keyRaw) : /^\d+$/.test(keyRaw) ? keyRaw : norm(keyRaw);
      map.set(key, parts.slice(1, 13).map(c => parseNum(c)));
      while (map.get(key).length < 12) map.get(key).push(0);
    }
    return map;
  }

  function convertUrlaubstool(csvText) {
    const lines = (csvText || "").replace(/\r\n?/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return { converted: "", missing: [] };

    const hdr = splitLine(lines[0]).map(norm);
    const idx = { pid: hdr.indexOf("personalnummer"), first: hdr.indexOf("vorname"), last: hdr.indexOf("nachname"),
      from: hdr.indexOf("von"), to: hdr.indexOf("bis"), type: hdr.indexOf("art der abwesenheit"), days: hdr.indexOf("anzahl der arbeitstage") };

    if (idx.pid < 0 || idx.from < 0 || idx.to < 0 || idx.days < 0) {
      alert("Urlaubstool-Format nicht erkannt"); return { converted: "", missing: [] };
    }

    const totals = new Map(), missing = [], holidays = new Map(), halfHolidays = new Map();
    const ensureYear = y => { if (!holidays.has(y)) { holidays.set(y, getHolidays(y)); halfHolidays.set(y, getHalfHolidays(y)); }};

    for (let i = 1; i < lines.length; i++) {
      const p = splitLine(lines[i]);
      if (p.length < hdr.length) continue;
      const pid = p[idx.pid]?.trim();
      if (!pid) { missing.push(`${(p[idx.first]||"")+" "+(p[idx.last]||"")} (${p[idx.from]}–${p[idx.to]}, ${p[idx.type]||""}, ${p[idx.days]} AT)`); continue; }
      if (!totals.has(pid)) totals.set(pid, new Array(12).fill(0));
      if (URLAUB_ONLY_ABSENCE_TYPE && !norm(p[idx.type]||"").includes(URLAUB_ONLY_ABSENCE_TYPE)) continue;
      const from = parseDE(p[idx.from]), to = parseDE(p[idx.to]);
      if (!from || !to) continue;
      ensureYear(from.getUTCFullYear()); ensureYear(to.getUTCFullYear());
      const dist = distribute(countWorkdays(from, to, holidays, halfHolidays), parseNum(p[idx.days]));
      totals.get(pid).forEach((v, m) => totals.get(pid)[m] = v + dist[m]);
    }

    const out = [["Personalnummer", ...MONTHS_DE].join(";")];
    [...totals.keys()].sort((a,b) => (+a||0)-(+b||0)).forEach(pid => out.push([pid, ...totals.get(pid).map(v => formatEU(Math.round(v*10)/10))].join(";")));
    return { converted: out.join("\n"), missing };
  }

  function convertExcelToCSV(text) {
    const lines = (text || "").replace(/\r\n?/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return "";
    // Detect delimiter: tab or multiple spaces
    const delim = lines[0].includes("\t") ? "\t" : /\s{2,}/.test(lines[0]) ? /\s{2,}/ : "\t";
    return lines.map(line => {
      const parts = line.split(delim).map(p => p.trim());
      // Convert decimal points to commas for numbers
      return parts.map(p => /^-?\d+\.?\d*$/.test(p) ? p.replace(".", ",") : p).join(";");
    }).join("\n");
  }

  // DOM interaction
  async function waitForReady(timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const w = document.querySelector(".cont-plannings.table--jfixed");
      const loader = w?.querySelector(".loading-planning");
      const loading = loader && getComputedStyle(loader).display !== "none";
      // Check for user rows (not inputs - they may not exist if all months are frozen)
      if (w && !loading && w.querySelectorAll('.table--planning.table--scrolling .table__body .table__row[data-user-id]').length) return true;
      await sleep(250);
    }
    return false;
  }

  function getDomUsers() {
    return [...document.querySelectorAll('.table--planning.table--fixed .tbody.table__row[data-user-id][data-is-active="1"]')].map(r => ({
      userId: r.getAttribute("data-user-id"),
      name: r.querySelector(".user-name")?.textContent?.trim() || "",
      nameKey: norm(r.querySelector(".user-name")?.textContent || "")
    }));
  }

  function exportTableAsCSV() {
    const rows = [];
    const fixedRows = document.querySelectorAll('.table--planning.table--fixed .tbody.table__row[data-user-id][data-is-active="1"]');
    const scrollingBody = document.querySelector('.table--planning.table--scrolling .table__body');

    for (const fixedRow of fixedRows) {
      const userId = fixedRow.getAttribute("data-user-id");
      const fullName = fixedRow.querySelector(".user-name")?.textContent?.trim() || "";

      // Parse name: Format is "LASTNAME Firstname" or "LASTNAME Firstname Middlename"
      const nameParts = fullName.split(/\s+/);
      let nachname = "", vorname = "";
      if (nameParts.length >= 2) {
        // First part is uppercase lastname, rest is firstname
        nachname = nameParts[0];
        vorname = nameParts.slice(1).join(" ");
      } else {
        nachname = fullName;
      }

      // Get month values from scrolling table
      const scrollingRow = scrollingBody?.querySelector(`.table__row[data-user-id="${CSS.escape(userId)}"]`);
      const monthValues = [];
      for (let m = 1; m <= 12; m++) {
        const cell = scrollingRow?.querySelector(`.table__cell[data-month="${m}"]`);
        // For month 1, check forecast subcell first, then direct input
        const input = m === 1
          ? (cell?.querySelector(".forecast input.value") || cell?.querySelector("input.value"))
          : cell?.querySelector("input.value");
        const div = cell?.querySelector("div.value");
        const val = input?.value || div?.textContent?.trim() || "0,0";
        monthValues.push(val);
      }

      rows.push([userId, ...monthValues, vorname, nachname].join(";"));
    }

    const header = ["Personalnummer", ...MONTHS_DE, "Vorname", "Nachname"].join(";");
    return [header, ...rows].join("\n");
  }

  function fillRow(userId, vals) {
    const row = document.querySelector(`.table--planning.table--scrolling .table__body .table__row[data-user-id="${CSS.escape(userId)}"]`);
    if (!row) return { updated: 0, missing: true };
    let updated = 0;
    for (let m = 1; m <= 12; m++) {
      const cell = row.querySelector(`.table__cell[data-month="${m}"]`);
      const input = m === 1 ? (cell?.querySelector(".forecast input.value") || cell?.querySelector("input.value")) : cell?.querySelector("input.value");
      // Skip past months that are no longer editable (disabled or readonly)
      if (input && !input.disabled && !input.readOnly) {
        const v = formatEU(vals[m-1] ?? 0);
        input.value = v; input.setAttribute("data-prev-value", v);
        ["input","change","blur"].forEach(e => input.dispatchEvent(new Event(e, {bubbles:true})));
        updated++;
      }
    }
    return { updated, missing: false };
  }

  // UI
  function makeList(items, emptyText = "— keine —") {
    const ul = el("ul");
    (items.length ? items : [emptyText]).forEach(t => ul.appendChild(el("li", {text: t})));
    return ul;
  }

  function showResult({ missingUsers, unknownInCsv, missingPnr }) {
    document.getElementById(OVERLAY_ID)?.remove();
    const overlay = el("div", {id: OVERLAY_ID, class: "tm-overlay"});
    const panel = el("div", {class: "tm-panel", style: "width:min(900px,92vw);max-height:80vh;overflow:auto"});

    panel.append(
      el("h3", {text: "Import Ergebnis"}),
      el("div", {class: "tm-section"}, [el("b", {text: "User ohne Import-Daten"}), makeList(missingUsers)]),
      el("div", {class: "tm-section"}, [el("b", {text: "Im CSV, aber nicht in Tabelle gefunden"}), makeList(unknownInCsv)]),
      el("div", {class: "tm-section"}, [el("b", {text: "Urlaubstool-Zeilen ohne Personalnummer"}), makeList(missingPnr)])
    );

    const btnRow = el("div", {class: "tm-row", style: "justify-content:flex-end;margin-top:14px"});
    const closeBtn = el("button", {class: "btn--default btn--light", text: "Schließen"});
    closeBtn.onclick = () => overlay.remove();
    btnRow.appendChild(closeBtn);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  function openModal() {
    document.getElementById(MODAL_ID)?.remove();
    let missingPnr = [];

    const overlay = el("div", {id: MODAL_ID, class: "tm-overlay"});
    const panel = el("div", {class: "tm-panel", style: "width:min(980px,94vw)"});
    const textarea = el("textarea", {placeholder: "Personalnummer;Januar;...;Dezember\noder Urlaubstool-Export einfügen"});

    const header = el("div", {class: "tm-row between", style: "margin-bottom:10px"});
    header.append(el("h3", {text: "Import Planning Data"}), el("div", {html: "<small>Format: <b>Personalnummer;Januar;...;Dezember[;Vorname;Nachname]</b></small>"}));

    const btnRow = el("div", {class: "tm-row between", style: "margin-top:12px"});
    const exportBtn = el("button", {class: "btn--default btn--light", text: "Tabelle exportieren"});
    const excelBtn = el("button", {class: "btn--default btn--light", text: "Excel \u2192 CSV"});
    const convertBtn = el("button", {class: "btn--default btn--light", text: "Urlaubstool \u2192 CSV"});
    const cancelBtn = el("button", {class: "btn--default btn--light", text: "Abbrechen"});
    const importBtn = el("button", {class: "btn--default btn--light", text: "Import starten"});

    exportBtn.onclick = () => {
      textarea.value = exportTableAsCSV();
    };
    excelBtn.onclick = () => {
      const csv = convertExcelToCSV(textarea.value);
      if (!csv) { alert("Keine Daten gefunden"); return; }
      textarea.value = csv;
    };
    convertBtn.onclick = () => {
      const res = convertUrlaubstool(textarea.value);
      if (!res.converted) { alert("Konvertierung fehlgeschlagen"); return; }
      textarea.value = res.converted;
      missingPnr = res.missing;
    };
    cancelBtn.onclick = () => overlay.remove();
    importBtn.onclick = async () => {
      if (!await waitForReady()) { alert("Planning table not ready"); return; }
      const csvMap = parsePlanningCSV(textarea.value);
      if (!csvMap.size) { alert("Keine importierbaren Zeilen gefunden"); return; }

      const users = getDomUsers(), missingUsers = [], unknownInCsv = [];
      for (const u of users) {
        const vals = csvMap.get(u.userId) || csvMap.get(u.nameKey);
        if (!vals || fillRow(u.userId, vals).missing) missingUsers.push(`${u.name} (ID ${u.userId})`);
      }
      for (const [k] of csvMap) {
        if (!/^\d+$/.test(k) ? !users.some(u => u.nameKey === k) : !users.some(u => u.userId === k)) unknownInCsv.push(k);
      }
      overlay.remove();
      showResult({ missingUsers, unknownInCsv, missingPnr });
    };

    btnRow.append(el("div", {class: "tm-row"}, [exportBtn, excelBtn, convertBtn]), el("div", {class: "tm-row"}, [cancelBtn, importBtn]));
    panel.append(header, textarea, btnRow);
    overlay.appendChild(panel);
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    setTimeout(() => textarea.focus(), 50);
  }

  // Init
  const BTN_SELECTOR = ".box--header h2";
  const BTN_ATTRS = {id: BTN_ID, type: "button", class: "btn--default btn--light", text: "Import Planning Data"};

  document.addEventListener("click", e => {
    if (e.target?.closest?.(`#${BTN_ID}`)) { e.preventDefault(); e.stopPropagation(); openModal(); }
  }, true);

  addButtonAfter(BTN_SELECTOR, BTN_ATTRS);
  new MutationObserver(() => addButtonAfter(BTN_SELECTOR, BTN_ATTRS)).observe(document.documentElement, {childList: true, subtree: true});
})();
