// ==UserScript==
// @name         Planning Table – Row & Column Highlight on Hover
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Highlights the entire row and month column when hovering over any cell in the planning table
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/GeCoO/Project/ManagePlanning.aspx?*
// @grant        none
// @run-at       document-end
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.planning-row-highlight.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.planning-row-highlight.user.js
// ==/UserScript==

(function () {
  "use strict";

  const ROW_COLOR = "rgba(255, 235, 59, 0.25)";
  const COL_COLOR = "rgba(66, 165, 245, 0.20)";
  const CROSS_COLOR = "rgba(76, 175, 80, 0.35)";

  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    .table--planning .table__row.tm-row-highlight,
    .table--planning .tbody.table__row.tm-row-highlight {
      background-color: ${ROW_COLOR} !important;
    }
    .table--planning .table__row.tm-row-highlight .table__cell,
    .table--planning .tbody.table__row.tm-row-highlight .table__cell {
      background-color: ${ROW_COLOR} !important;
    }
    .table--planning .table__cell.tm-col-highlight {
      background-color: ${COL_COLOR} !important;
    }
    .table--planning .tm-row-highlight .table__cell.tm-col-highlight {
      background-color: ${CROSS_COLOR} !important;
    }
  `;
  document.head.appendChild(style);

  function highlightRow(userId, highlight) {
    if (!userId) return;
    document.querySelectorAll(`.table--planning .table__row[data-user-id="${CSS.escape(userId)}"], .table--planning .tbody.table__row[data-user-id="${CSS.escape(userId)}"]`)
      .forEach(row => row.classList.toggle("tm-row-highlight", highlight));
  }

  function highlightMonth(month, highlight) {
    if (!month) return;
    document.querySelectorAll(`.table--planning .table__cell[data-month="${CSS.escape(month)}"]`)
      .forEach(cell => cell.classList.toggle("tm-col-highlight", highlight));
  }

  // Event delegation for hover
  document.addEventListener("mouseenter", e => {
    const cell = e.target.closest(".table--planning .table__cell[data-month]");
    if (cell) highlightMonth(cell.getAttribute("data-month"), true);

    const row = e.target.closest(".table--planning .table__row[data-user-id], .table--planning .tbody.table__row[data-user-id]");
    if (row) highlightRow(row.getAttribute("data-user-id"), true);
  }, true);

  document.addEventListener("mouseleave", e => {
    const cell = e.target.closest(".table--planning .table__cell[data-month]");
    if (cell) highlightMonth(cell.getAttribute("data-month"), false);

    const row = e.target.closest(".table--planning .table__row[data-user-id], .table--planning .tbody.table__row[data-user-id]");
    if (row) highlightRow(row.getAttribute("data-user-id"), false);
  }, true);
})();
