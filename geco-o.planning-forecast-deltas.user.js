// ==UserScript==
// @name         Planning Forecast Deltas
// @namespace    https://geco.reply.com/
// @version      2.0.0
// @description  Show deltas for forecasts
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/*
// @match        https://geco.reply.eu/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.planning-forecast-deltas.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.planning-forecast-deltas.user.js
// @noframes
// ==/UserScript==
// == Changelog ========================================================================================================
// 2.0.0    Fix selectors to work with both .forecast wrapped and direct inputs in month cells
// 1.0      Initial release

(function() {
    'use strict';

    const DEBUG = false;

    function dbg(...args) {
        if (DEBUG) console.log('[ForecastDeltas]', ...args);
    }

    /** Inject styles **/
    function ensureStyles() {
        if (document.getElementById('tm-forecast-diff-style')) return;

        const style = document.createElement('style');
        style.id = 'tm-forecast-diff-style';

        style.textContent = `
            /* Cells with deltas */
            .table__cell.tm-forecast-has-diff,
            .forecast.table__subcell.tm-forecast-has-diff {
                overflow: visible;
                position: relative;
            }

            .tm-forecast-diff {
                float: left;
                margin-right: 4px;
                font-size: 1.25em !important;
                font-weight: bold;
                white-space: nowrap;
                display: none; /* Wird nur gezeigt wenn != 0 */
            }

            /* Footer total delta */
            .tm-forecast-diff-total {
                float: left;
                margin-right: 6px;
                font-size: 1.25em !important;
                font-weight: bold;
                white-space: nowrap;
                display: none; /* Wird nur gezeigt wenn != 0 */
            }
        `;

        document.head.appendChild(style);
        dbg("Styles injected");
    }

    /** Parsing helper **/
    function parseDE(str) {
        if (!str) return 0;
        str = str.replace(/\./g, '').replace(',', '.').trim();
        const n = parseFloat(str);
        return isNaN(n) ? 0 : n;
    }

    /** Delta format **/
    function formatDelta(num) {
        const sign = num > 0 ? "+" : "";
        let formatted = Math.abs(num).toFixed(3).replace('.', ',');
        formatted = formatted.replace(/(,\d*?)0+$/, "$1").replace(/,$/, ",0");
        return sign + formatted;
    }

    /** Init one planning table **/
    function initPlanningTable(table) {
        if (table.dataset.tmForecastDone === "1") return;
        table.dataset.tmForecastDone = "1";

        ensureStyles();

        dbg("Init planning table:", table);

        // Find ALL inputs with data-init-value in month cells (both .forecast wrapped and direct)
        const inputs = table.querySelectorAll(
            '.table__body .table__cell[data-month] input.value[data-init-value]'
        );

        dbg("Forecast inputs:", inputs.length);

        inputs.forEach(input => {
            if (input.dataset.tmInit) return;
            input.dataset.tmInit = "1";

            input.dataset.tmBase = input.getAttribute("data-init-value") || input.value || "0";

            // Container can be .forecast subcell or .table__cell directly
            const container = input.closest('.forecast') || input.closest('.table__cell');
            container.classList.add("tm-forecast-has-diff");

            let diffSpan = container.querySelector(".tm-forecast-diff");
            if (!diffSpan) {
                diffSpan = document.createElement("span");
                diffSpan.className = "tm-forecast-diff";
                container.insertBefore(diffSpan, input);
            }

            const handler = () => updateCellDelta(input, table);
            input.addEventListener("input", handler);
            input.addEventListener("change", handler);

            updateCellDelta(input, table);
        });

        updateAllTotals(table);
    }

    /** Update a single cell **/
    function updateCellDelta(input, table) {
        const base = parseDE(input.dataset.tmBase || "0");
        const curr = parseDE(input.value);
        const delta = curr - base;

        dbg("Delta cell:", input, "=", delta);

        const container = input.closest('.forecast') || input.closest('.table__cell');
        const span = container?.querySelector(".tm-forecast-diff");
        if (!span) return;

        if (Math.abs(delta) < 1e-9) {
            span.style.display = "none";
        } else {
            span.textContent = formatDelta(delta);
            span.style.color = delta > 0 ? "#008800" : "#bb0000";
            span.style.display = "inline";
        }

        const cell = input.closest('.table__cell[data-month]');
        if (cell) {
            updateColumnTotal(table, cell.getAttribute("data-month"));
        }
    }

    /** Update total for one month **/
    function updateColumnTotal(table, month) {
        // Find all inputs with init values in this month (both .forecast wrapped and direct)
        const inputs = table.querySelectorAll(
            `.table__body .table__cell[data-month="${month}"] input.value[data-init-value]`
        );

        let total = 0;
        inputs.forEach(inp => {
            const base = parseDE(inp.dataset.tmBase || "0");
            const curr = parseDE(inp.value);
            total += (curr - base);
        });

        dbg(`Month ${month} total delta =`, total);

        // Footer cell can have .forecast subcell or contain .value directly
        const footerCell = table.querySelector(
            `.table__foot .table__row--totals .table__cell[data-month="${month}"]`
        );
        if (!footerCell) return;

        const footerContainer = footerCell.querySelector('.forecast') || footerCell;
        const valueEl = footerContainer.querySelector(".value");
        if (!valueEl) return;

        let span = footerContainer.querySelector('.tm-forecast-diff-total');
        if (!span) {
            span = document.createElement("span");
            span.className = "tm-forecast-diff-total";
            footerContainer.insertBefore(span, valueEl);
        }

        if (Math.abs(total) < 1e-9) {
            span.style.display = "none";
        } else {
            span.textContent = formatDelta(total);
            span.style.color = total > 0 ? "#008800" : "#bb0000";
            span.style.display = "inline";
        }
    }

    function updateAllTotals(table) {
        const months = table.querySelectorAll(
            '.table__foot .table__row--totals .table__cell[data-month]'
        );

        months.forEach(cell => {
            updateColumnTotal(table, cell.getAttribute("data-month"));
        });
    }

    /** Initialization watcher **/
    function tryInit() {
        const tables = document.querySelectorAll('.table.table--planning.table--scrolling');
        if (!tables.length) return false;

        tables.forEach(initPlanningTable);
        return true;
    }

    if (!tryInit()) {
        const observer = new MutationObserver(tryInit);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        window.addEventListener("hashchange", () => setTimeout(tryInit, 200));
    }
})();