// ==UserScript==
// @name         GECO-T - Expenses Sum Row
// @namespace    https://geco.reply.com/
// @version      1.0.0
// @description  Show a row with the sum for expenses
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/ExpenseAccounts/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-t.expenses-sum.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-t.expenses-sum.user.js
// ==/UserScript==
// == Changelog ========================================================================================================
// 1.0      Initial release

(function () {
    "use strict";

    const BASE_SUM_ROW_ID = "tm-sum-row-expenses";

    // Konfiguration für mehrere Tabellen/Seiten
    // - resultExpToApprove: Liste (Approve Travelling Allowances) -> meist nur "Tot."
    // - tbDetailsBody (+ tbDetailsHeader): Details-Modal -> "Travelling Allowance", "Allowance", ggf. "Reb."
    const TABLES = [
        {
            key: "approve-list",
            bodyTableId: "resultExpToApprove",
            headerTableId: "resultExpToApprove", // Header sitzt im selben Table
            bodyRowSelector: "tbody tr.trUpperRow",
            labelCellIndex: 0,
            sumColumns: [
                // Bei manchen Seiten existiert "Ref." / "Reb." zusätzlich – wenn nicht vorhanden, wird einfach übersprungen.
                { key: "ref", matchers: [/^\s*ref\.?\s*$/i, /^\s*reb\.?\s*$/i] },
                { key: "tot", matchers: [/^\s*tot\.?/i, /total/i] }
            ]
        },
        {
            key: "details-modal",
            bodyTableId: "tbDetailsBody",
            headerTableId: "tbDetailsHeader", // Header ist ein separates Table
            bodyRowSelector: "tbody tr",
            labelCellIndex: 0,
            sumColumns: [
                { key: "travel", matchers: [/travelling\s*allowance/i] },
                { key: "allowance", matchers: [/^\s*allowance\s*$/i] },
                { key: "reb", matchers: [/^\s*reb\.?\s*$/i, /reimb/i] }
            ]
        }
    ];

    function normalizeText(s) {
        return (s || "")
            .toString()
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function parseGermanNumber(text) {
        const s = (text || "")
            .toString()
            .replace(/\s/g, "")
            .replace("€", "")
            .replace(/\./g, "")
            .replace(",", ".")
            .trim();
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }

    function formatGermanNumber(n) {
        const fixed = (Number.isFinite(n) ? n : 0).toFixed(2);
        const [intPart, decPart] = fixed.split(".");
        const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `${withThousands},${decPart}`;
    }

    function getHeaderThs(headerTable) {
        // robust: thead th, sonst alle th
        const ths = headerTable.querySelectorAll("thead th");
        return ths.length ? Array.from(ths) : Array.from(headerTable.querySelectorAll("th"));
    }

    function headerIndexByMatchers(headerThs, matchers) {
        for (let i = 0; i < headerThs.length; i++) {
            const t = normalizeText(headerThs[i].textContent);
            for (const re of matchers) {
                if (re.test(t)) return i;
            }
        }
        return -1;
    }

    function ensureSumRow(tbody, colCount, sumRowId, labelCellIndex, labelText) {
        let tr = tbody.querySelector(`#${CSS.escape(sumRowId)}`);
        if (tr) return tr;

        tr = document.createElement("tr");
        tr.id = sumRowId;
        tr.style.fontWeight = "700";
        tr.style.borderTop = "2px solid #ccc";

        for (let i = 0; i < colCount; i++) {
            const td = document.createElement("td");
            td.style.whiteSpace = "nowrap";
            td.style.paddingTop = "8px";
            td.style.paddingBottom = "8px";
            tr.appendChild(td);
        }

        if (tr.children[labelCellIndex]) tr.children[labelCellIndex].textContent = labelText;

        tbody.appendChild(tr);
        return tr;
    }

    function updateOne(cfg) {
        const bodyTable = document.getElementById(cfg.bodyTableId);
        const headerTable = document.getElementById(cfg.headerTableId);
        if (!bodyTable || !headerTable) return;

        const tbody = bodyTable.querySelector("tbody");
        if (!tbody) return;

        const headerThs = getHeaderThs(headerTable);
        const colCount = headerThs.length;
        if (!colCount) return;

        // Spaltenindizes ermitteln (wenn nicht vorhanden -> -1)
        const colMap = {};
        for (const sc of cfg.sumColumns) {
            colMap[sc.key] = headerIndexByMatchers(headerThs, sc.matchers);
        }

        // Wenn keine der Zielspalten existiert: nichts tun
        const anyColExists = Object.values(colMap).some((idx) => idx >= 0);
        if (!anyColExists) return;

        // Body-rows auswählen (SumRow ausschließen)
        const sumRowId = `${BASE_SUM_ROW_ID}-${cfg.key}-${cfg.bodyTableId}`;
        const rows = Array.from(bodyTable.querySelectorAll(cfg.bodyRowSelector)).filter(
            (r) => r.id !== sumRowId
        );

        // Leere/Placeholder-Zeilen vermeiden (Details können auch leer sein)
        const dataRows = rows.filter((r) => r.querySelectorAll("td").length >= colCount);

        const sums = {};
        for (const key of Object.keys(colMap)) sums[key] = 0;

        for (const row of dataRows) {
            const tds = row.querySelectorAll("td");
            for (const [key, idx] of Object.entries(colMap)) {
                if (idx < 0) continue;
                sums[key] += parseGermanNumber(tds[idx]?.innerText || tds[idx]?.textContent || "");
            }
        }

        const sumRow = ensureSumRow(
            tbody,
            colCount,
            sumRowId,
            cfg.labelCellIndex,
            "Summe"
        );

        const cells = sumRow.querySelectorAll("td");
        for (const [key, idx] of Object.entries(colMap)) {
            if (idx < 0) continue;
            if (!cells[idx]) continue;
            cells[idx].textContent = `${formatGermanNumber(sums[key])} €`;
        }
    }

    function updateAll() {
        for (const cfg of TABLES) updateOne(cfg);
    }

    function hookAspNetAjax() {
        const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
        if (!prm) return false;

        prm.add_endRequest(function () {
            // ASP.NET AJAX: DOM kann nach EndRequest noch kurz "nachziehen"
            window.setTimeout(updateAll, 0);
            window.setTimeout(updateAll, 150);
        });

        return true;
    }

    // Init
    updateAll();

    // Primär: ASP.NET AJAX Hook
    const hooked = hookAspNetAjax();

    // Fallback: beobachte grob (Modal + ContentPanel + Page Content)
    if (!hooked) {
        let queued = false;
        const mo = new MutationObserver(() => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                updateAll();
            });
        });

        mo.observe(document.body, { childList: true, subtree: true, attributes: false });
    }
})();