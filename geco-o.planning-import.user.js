// ==UserScript==
// @name         Planning Table – Import Planning Data (CSV + Urlaubstool-Konverter via Personalnummer=data-user-id)
// @namespace    https://tampermonkey.net/
// @version      2.3.1
// @description  Paste semicolon CSV. Supports direct format Personalnummer;Januar;...;Dezember. Also converts Urlaubstool CSV (Personalnummer;Vorname;Nachname;...;Von;Bis;...;Art;Anzahl der Arbeitstage). Matching is done by Personalnummer == data-user-id. Splits across months by WORKDAYS (Mon–Fri, German national public holidays). Empty cells => 0. Shows overlay with users missing import data AND Urlaubstool rows without Personalnummer.
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const BTN_ID = "tm-import-planning-data";
  const MODAL_ID = "tm-import-modal";
  const OVERLAY_ID = "tm-import-result-overlay";

  // Only import these absence types from Urlaubstool.
  // Set to null to import all.
  const URLAUB_ONLY_ABSENCE_TYPE = "erholungsurlaub"; // normalized compare

  const MONTHS_DE = [
    "Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function norm(s) {
    return (s || "")
      .toString()
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  async function waitForPlanningReady(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const wrapper = document.querySelector(".cont-plannings.table--jfixed");
      if (!wrapper) {
        await sleep(250);
        continue;
      }

      const loader = wrapper.querySelector(".loading-planning");
      const loading = loader && isVisible(loader);

      const anyInput =
        wrapper.querySelectorAll(
          '.table--planning.table--scrolling .table__body .table__row[data-user-id] input.value'
        ).length > 0;

      if (!loading && anyInput) return true;
      await sleep(250);
    }
    return false;
  }

  function formatEU(num) {
    if (!Number.isFinite(num)) num = 0;
    return num.toFixed(1).replace(".", ",");
  }

  function parseCellToNumber(raw) {
    const s = (raw ?? "").toString().trim();
    if (!s) return 0;
    const normalized = s.replace(",", ".");
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return n;
  }

  function splitLine(line) {
    if (line.includes(";")) return line.split(";").map((p) => p.trim());
    if (line.includes("\t")) return line.split("\t").map((p) => p.trim());
    return line.split(",").map((p) => p.trim());
  }

  function looksLikePlanningHeader(parts) {
    const first = norm(parts[0]);
    if (
      first === "user" ||
      first === "name" ||
      first === "username" ||
      first === "personalnummer" ||
      first === "userid"
    ) {
      return true;
    }

    const months = [
      "januar","jan","februar","feb","marz","maerz","mrz","mar","april","apr","mai","may",
      "juni","jun","juli","jul","august","aug","september","sep","oktober","okt","oct",
      "november","nov","dezember","dez","dec",
    ].map(norm);

    return parts.slice(1).some((p) => months.includes(norm(p)));
  }

  /**
   * Parse planning import CSV.
   * Supported:
   *  - Personalnummer;Januar;...;Dezember
   *  - User;Januar;...;Dezember (legacy)
   *
   * Returns Map<key, months[12]>, where key is either numeric id as string (preferred) or normalized user name.
   */
  function parsePlanningCSV(text) {
    const map = new Map();
    const lines = (text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length);

    if (!lines.length) return map;

    // detect header and whether first column is "Personalnummer"
    let firstParts = splitLine(lines[0]);
    const hasHeader = looksLikePlanningHeader(firstParts);
    let headerParts = hasHeader ? firstParts : null;

    let keyMode = "auto"; // "id" | "name" | "auto"
    if (headerParts) {
      const h0 = norm(headerParts[0]);
      if (h0 === "personalnummer" || h0 === "userid" || h0 === "user-id" || h0 === "data-user-id") keyMode = "id";
      if (h0 === "user" || h0 === "name" || h0 === "username") keyMode = "name";
    }

    for (let i = 0; i < lines.length; i++) {
      const parts = splitLine(lines[i]);
      if (i === 0 && hasHeader) continue;

      const keyRaw = (parts[0] || "").trim();
      if (!keyRaw) continue;

      // Decide per-line: numeric => id, else name (unless forced by header)
      let key;
      if (keyMode === "id") key = keyRaw;
      else if (keyMode === "name") key = norm(keyRaw);
      else key = /^\d+$/.test(keyRaw) ? keyRaw : norm(keyRaw);

      if (!key) continue;

      const values = new Array(12).fill(0);
      for (let m = 0; m < 12; m++) {
        const cell = parts[m + 1] ?? "";
        values[m] = parseCellToNumber(cell);
      }
      map.set(key, values);
    }

    return map;
  }

  function setInputValueAndTrigger(input, valueEU) {
    input.value = valueEU;
    input.setAttribute("data-prev-value", valueEU);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function getDomUsers() {
    const fixedRows = document.querySelectorAll(
      '.table--planning.table--fixed .tbody.table__row[data-user-id]'
    );
    if (!fixedRows.length) return [];

    return Array.from(fixedRows).map((r) => {
      const userId = r.getAttribute("data-user-id"); // IMPORTANT
      const nameEl = r.querySelector(".user-name");
      const name = (nameEl?.textContent || "").trim();
      return { userId, name, nameKey: norm(name) };
    });
  }

  function fillUserRowById(userId, monthValues) {
    const row = document.querySelector(
      `.table--planning.table--scrolling .table__body .table__row[data-user-id="${CSS.escape(
        userId
      )}"]`
    );
    if (!row) return { updated: 0, missing: true };

    let updated = 0;

    for (let m = 1; m <= 12; m++) {
      const valueEU = formatEU(monthValues[m - 1] ?? 0);

      if (m === 1) {
        const janCell = row.querySelector(`.table__cell[data-month="1"]`);
        const input =
          janCell?.querySelector(".forecast input.value") ||
          janCell?.querySelector("input.value");
        if (input && !input.disabled) {
          setInputValueAndTrigger(input, valueEU);
          updated++;
        }
      } else {
        const cell = row.querySelector(`.table__cell[data-month="${m}"]`);
        const input = cell?.querySelector("input.value");
        if (input && !input.disabled) {
          setInputValueAndTrigger(input, valueEU);
          updated++;
        }
      }
    }

    return { updated, missing: false };
  }

  function showResultOverlay({ missingUsers, importedCount, updatedInputsCount, unknownInCsv, missingPersonalnummer }) {
    document.getElementById(OVERLAY_ID)?.remove();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 999999;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

    const panel = document.createElement("div");
    panel.style.cssText = `
      width: min(900px, 92vw);
      max-height: 80vh;
      overflow: auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.35);
      padding: 18px 18px 14px;
    `;

    const title = document.createElement("div");
    title.style.cssText = `font-size: 18px; font-weight: 700; margin-bottom: 10px;`;
    title.textContent = "Import Ergebnis";

    const summary = document.createElement("div");
    summary.style.cssText = `font-size: 14px; margin-bottom: 12px; line-height: 1.4;`;
    summary.innerHTML = ``;

    const section1 = document.createElement("div");
    section1.style.cssText = `margin-top: 10px;`;
    section1.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">User ohne Import-Daten</div>`;

    const list1 = document.createElement("ul");
    list1.style.cssText = `margin: 0 0 10px 18px; font-size: 14px;`;
    if (missingUsers.length) {
      missingUsers.forEach((u) => {
        const li = document.createElement("li");
        li.textContent = u;
        list1.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "— keine —";
      list1.appendChild(li);
    }

    const section2 = document.createElement("div");
    section2.style.cssText = `margin-top: 10px;`;
    section2.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">Im CSV, aber nicht in der Tabelle gefunden</div>`;

    const list2 = document.createElement("ul");
    list2.style.cssText = `margin: 0 0 10px 18px; font-size: 14px;`;
    if (unknownInCsv.length) {
      unknownInCsv.forEach((u) => {
        const li = document.createElement("li");
        li.textContent = u;
        list2.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "— keine —";
      list2.appendChild(li);
    }

    const section3 = document.createElement("div");
    section3.style.cssText = `margin-top: 10px;`;
    section3.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">Urlaubstool-Zeilen ohne Personalnummer (können nicht importiert werden)</div>`;

    const list3 = document.createElement("ul");
    list3.style.cssText = `margin: 0 0 14px 18px; font-size: 14px;`;

    if ((missingPersonalnummer || []).length) {
      missingPersonalnummer.forEach((u) => {
        const li = document.createElement("li");
        li.textContent = u;
        list3.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "— keine —";
      list3.appendChild(li);
    }

    const btnRow = document.createElement("div");
    btnRow.style.cssText = `display:flex; justify-content:flex-end; gap:10px;`;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Schließen";
    closeBtn.className = "btn--default btn--light";
    closeBtn.addEventListener("click", () => overlay.remove());

    btnRow.appendChild(closeBtn);

    panel.appendChild(title);
    panel.appendChild(summary);
    panel.appendChild(section1);
    panel.appendChild(list1);
    panel.appendChild(section2);
    panel.appendChild(list2);
    panel.appendChild(section3);
    panel.appendChild(list3);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // -------------------------
  // DE holidays (national) + working days
  // -------------------------

  function easterSundayUTC(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  function ymdKeyUTC(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function addDaysUTC(d, days) {
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    nd.setUTCDate(nd.getUTCDate() + days);
    return nd;
  }

  function germanNationalHolidaysUTC(year) {
    const set = new Set();

    const easter = easterSundayUTC(year);
    const goodFriday = addDaysUTC(easter, -2);
    const easterMonday = addDaysUTC(easter, 1);
    const ascension = addDaysUTC(easter, 39);
    const whitMonday = addDaysUTC(easter, 50);

    const fixed = [
      new Date(Date.UTC(year, 0, 1)),   // Neujahr
      new Date(Date.UTC(year, 4, 1)),   // Tag der Arbeit
      new Date(Date.UTC(year, 9, 3)),   // Tag der Deutschen Einheit
      new Date(Date.UTC(year, 11, 25)), // 1. Weihnachtstag
      new Date(Date.UTC(year, 11, 26)), // 2. Weihnachtstag
    ];

    [...fixed, goodFriday, easterMonday, ascension, whitMonday].forEach((d) => set.add(ymdKeyUTC(d)));
    return set;
  }

  function isWorkingDayUTC(d, holidaySetByYear) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) return false;
    const y = d.getUTCFullYear();
    const set = holidaySetByYear.get(y) || new Set();
    return !set.has(ymdKeyUTC(d));
  }

  function parseDateDEToUTC(s) {
    const t = (s || "").toString().trim();
    const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const d = new Date(Date.UTC(yy, mm - 1, dd));
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function workingDaysByMonthInRangeUTC(fromUTC, toUTC, holidaySetByYear) {
    const counts = new Array(12).fill(0);
    let d = new Date(Date.UTC(fromUTC.getUTCFullYear(), fromUTC.getUTCMonth(), fromUTC.getUTCDate()));
    const end = new Date(Date.UTC(toUTC.getUTCFullYear(), toUTC.getUTCMonth(), toUTC.getUTCDate()));
    while (d.getTime() <= end.getTime()) {
      if (isWorkingDayUTC(d, holidaySetByYear)) counts[d.getUTCMonth()] += 1;
      d = addDaysUTC(d, 1);
    }
    return counts;
  }

  function distributeTotalDaysByWorkingDays(monthWorkdayCounts, totalDays) {
    const totalWorkdays = monthWorkdayCounts.reduce((a, b) => a + b, 0);
    const out = new Array(12).fill(0);
    if (totalWorkdays <= 0 || !Number.isFinite(totalDays) || totalDays === 0) return out;

    const raw = monthWorkdayCounts.map((wd) => (wd > 0 ? (totalDays * wd) / totalWorkdays : 0));
    const rounded = raw.map((v) => Math.round(v * 10) / 10);

    const sum = rounded.reduce((a, b) => a + b, 0);
    const diff = Math.round((totalDays - sum) * 10) / 10;

    if (diff !== 0) {
      let last = -1;
      for (let i = 11; i >= 0; i--) {
        if (monthWorkdayCounts[i] > 0) { last = i; break; }
      }
      if (last >= 0) rounded[last] = Math.round((rounded[last] + diff) * 10) / 10;
    }

    for (let i = 0; i < 12; i++) out[i] = rounded[i];
    return out;
  }

  // -------------------------
  // Urlaubstool -> Planning Converter (Personalnummer=data-user-id)
  // -------------------------

  /**
   * Returns { converted, missingPersonalnummer }
   * converted is planning CSV in format:
   * Personalnummer;Januar;...;Dezember
   */
  function convertUrlaubstoolCsvToPlanning(csvText) {
    const lines = (csvText || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length);

    if (!lines.length) return { converted: "", missingPersonalnummer: [] };

    const headerRaw = splitLine(lines[0]).map((h) => norm(h));
    const hasHeader =
      headerRaw.includes("personalnummer") &&
      headerRaw.includes("vorname") &&
      headerRaw.includes("nachname") &&
      headerRaw.includes("von") &&
      headerRaw.includes("bis") &&
      headerRaw.includes("anzahl der arbeitstage");

    const idx = {
      pid: headerRaw.indexOf("personalnummer"),
      first: headerRaw.indexOf("vorname"),
      last: headerRaw.indexOf("nachname"),
      from: headerRaw.indexOf("von"),
      to: headerRaw.indexOf("bis"),
      type: headerRaw.indexOf("art der abwesenheit"),
      days: headerRaw.indexOf("anzahl der arbeitstage"),
    };

    if (!hasHeader || idx.pid < 0 || idx.from < 0 || idx.to < 0 || idx.days < 0) {
      alert("Urlaubstool-Format nicht erkannt (Header fehlt/abweichend).");
      return { converted: "", missingPersonalnummer: [] };
    }

    const holidaySetByYear = new Map();
    const ensureHolidayYear = (year) => {
      if (!holidaySetByYear.has(year)) holidaySetByYear.set(year, germanNationalHolidaysUTC(year));
    };

    // Map<personalnummer, months[12]>
    const totals = new Map();
    const missingPersonalnummer = [];

    function ensurePid(pid) {
      const key = (pid || "").toString().trim();
      if (!key) return null;
      if (!totals.has(key)) totals.set(key, new Array(12).fill(0));
      return totals.get(key);
    }

    for (let li = 1; li < lines.length; li++) {
      const parts = splitLine(lines[li]);
      if (parts.length < headerRaw.length) continue;

      const pid = (parts[idx.pid] || "").trim();

      if (!pid) {
        const first = (parts[idx.first] || "").trim();
        const last = (parts[idx.last] || "").trim();
        const from = (parts[idx.from] || "").trim();
        const to = (parts[idx.to] || "").trim();
        const days = (parts[idx.days] || "").trim();
        const type = (parts[idx.type] || "").trim();

        missingPersonalnummer.push(
          `${(first + " " + last).trim()} (${from}–${to}, ${type}, ${days} AT)`
        );
        continue;
      }

      const monthsArr = ensurePid(pid);
      if (!monthsArr) continue;

      const abwType = norm(parts[idx.type] || "");
      if (URLAUB_ONLY_ABSENCE_TYPE && abwType && !abwType.includes(URLAUB_ONLY_ABSENCE_TYPE)) continue;

      const fromD = parseDateDEToUTC(parts[idx.from]);
      const toD = parseDateDEToUTC(parts[idx.to]);
      if (!fromD || !toD) continue;

      ensureHolidayYear(fromD.getUTCFullYear());
      ensureHolidayYear(toD.getUTCFullYear());

      const totalDays = parseCellToNumber(parts[idx.days]);
      const monthWorkdays = workingDaysByMonthInRangeUTC(fromD, toD, holidaySetByYear);
      const distributed = distributeTotalDaysByWorkingDays(monthWorkdays, totalDays);

      for (let m = 0; m < 12; m++) monthsArr[m] += distributed[m];
    }

    const outLines = [];
    outLines.push(["Personalnummer", ...MONTHS_DE].join(";"));

    const sortedPids = Array.from(totals.keys()).sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
    for (const pid of sortedPids) {
      const months = totals.get(pid);
      const row = [pid, ...months.map((v) => formatEU(Math.round(v * 10) / 10))];
      outLines.push(row.join(";"));
    }

    return { converted: outLines.join("\n"), missingPersonalnummer };
  }

  // -------------------------
  // Modal
  // -------------------------

  function openImportModal() {
    document.getElementById(MODAL_ID)?.remove();

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 999998;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

    const panel = document.createElement("div");
    panel.style.cssText = `
      width: min(980px, 94vw);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.35);
      padding: 16px;
    `;

    const header = document.createElement("div");
    header.style.cssText = `display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px; flex-wrap: wrap;`;
    header.innerHTML = `
      <div style="font-size:18px;font-weight:700;">Import Planning Data</div>
      <div style="font-size:12px;color:#666;">
        Zielformat: <b>Personalnummer;Januar;...;Dezember</b> (leer = 0)
      </div>
    `;

    const textarea = document.createElement("textarea");
    textarea.placeholder =
      "1) Direkt-Import (empfohlen):\nPersonalnummer;Januar;Februar;...;Dezember\n54517;1,0;;0;...;0\n\n" +
      "2) Urlaubstool (mit Personalnummer=data-user-id):\nPersonalnummer;Vorname;Nachname;...;Von;Bis;...;Art der Abwesenheit;Anzahl der Arbeitstage\n54517;Jens;Petersen;...;02.01.2026;02.01.2026;...;Erholungsurlaub;1\n\n" +
      "Dann: 'Daten aus Urlaubstool konvertieren' → 'Import starten'";
    textarea.style.cssText = `
      width: 100%;
      height: 320px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.35;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 10px;
      outline: none;
    `;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = `display:flex; justify-content:space-between; gap:10px; margin-top: 12px; flex-wrap: wrap;`;

    const leftRow = document.createElement("div");
    leftRow.style.cssText = `display:flex; gap:10px; flex-wrap: wrap;`;

    const rightRow = document.createElement("div");
    rightRow.style.cssText = `display:flex; gap:10px; flex-wrap: wrap; margin-left:auto;`;

    const convertBtn = document.createElement("button");
    convertBtn.textContent = "Daten aus Urlaubstool konvertieren";
    convertBtn.className = "btn--default btn--light";

    convertBtn.addEventListener("click", () => {
      try {
        const res = convertUrlaubstoolCsvToPlanning(textarea.value || "");
        if (!res.converted) {
          alert("Konnte nichts konvertieren – ist das Textfeld leer oder Format unerkannt?");
          return;
        }

        textarea.value = res.converted;
        window.__tm_missingPersonalnummer = res.missingPersonalnummer || [];
      } catch (e) {
        console.error("[TM] Convert error", e);
        alert("Konvertierung fehlgeschlagen. Details in der Konsole.");
      }
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Abbrechen";
    cancelBtn.className = "btn--default btn--light";
    cancelBtn.addEventListener("click", () => overlay.remove());

    const importBtn = document.createElement("button");
    importBtn.textContent = "Import starten";
    importBtn.className = "btn--default btn--light";

    importBtn.addEventListener("click", async () => {
      window.__tm_missingPersonalnummer = window.__tm_missingPersonalnummer || [];

      const ok = await waitForPlanningReady();
      if (!ok) {
        alert("Planning table not ready (timeout) – selectors/loading?");
        return;
      }

      const csvText = textarea.value || "";
      const csvMap = parsePlanningCSV(csvText);

      if (!csvMap.size) {
        alert("Keine importierbaren Zeilen gefunden. Prüfe das CSV-Format (Semikolon-getrennt).");
        return;
      }

      const domUsers = getDomUsers();
      const missingUsers = [];
      let importedCount = 0;
      let updatedInputsCount = 0;

      for (const u of domUsers) {
        // match by Personalnummer == data-user-id (fallback by nameKey)
        const vals = csvMap.get(u.userId) || csvMap.get(u.nameKey);

        if (!vals) {
          missingUsers.push(`${u.name} (ID ${u.userId})`);
          continue;
        }

        const res = fillUserRowById(u.userId, vals);
        if (!res.missing) {
          importedCount++;
          updatedInputsCount += res.updated;
        } else {
          missingUsers.push(`${u.name} (ID ${u.userId})`);
        }
      }

      const unknownInCsv = [];
      for (const [key] of csvMap.entries()) {
        const isNumeric = /^\d+$/.test(key);
        const exists = isNumeric
          ? domUsers.some((u) => u.userId === key)
          : domUsers.some((u) => u.nameKey === key);
        if (!exists) unknownInCsv.push(key);
      }

      overlay.remove();

      showResultOverlay({
        missingUsers,
        importedCount,
        updatedInputsCount,
        unknownInCsv,
        missingPersonalnummer: window.__tm_missingPersonalnummer || [],
      });
    });

    leftRow.appendChild(convertBtn);

    rightRow.appendChild(cancelBtn);
    rightRow.appendChild(importBtn);

    btnRow.appendChild(leftRow);
    btnRow.appendChild(rightRow);

    panel.appendChild(header);
    panel.appendChild(textarea);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    setTimeout(() => textarea.focus(), 50);
  }

  // -------------------------
  // Button under H2 + init
  // -------------------------

  function addButtonUnderH2() {
    const h2 = document.querySelector(".box--header h2");
    if (!h2) return false;

    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.className = "btn--default btn--light";
      btn.textContent = "Import Planning Data";

      h2.insertAdjacentElement("afterend", btn);
    }

    return true;
  }

  function installDelegatedClickHandler() {
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target?.closest?.(`#${BTN_ID}`);
        if (!btn) return;
        
        e.preventDefault();
        e.stopPropagation();
        openImportModal();
      },
      true
    );
  }

  function init() {
    installDelegatedClickHandler();
    addButtonUnderH2();

    const mo = new MutationObserver(() => addButtonUnderH2());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  init();
})();