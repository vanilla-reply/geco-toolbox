// ==UserScript==
// @name         Team - Sort by Alphabet
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  Adjusts the numbering of table rows by the first word of the last name before saving the form
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/GeCoO/Project/ManageTeam.aspx?sc=*
// @grant        none
// @run-at       document-end
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team-sort.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team-sort.user.js
// ==/UserScript==

(function () {
  "use strict";

  const BTN_ID = "tm-team-sort-btn";

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

  const norm = s => (s || "").trim().split(/\s+/)[0]?.toUpperCase() || "";

  function adjustSortingByAlphabet() {
    const rows = Array.from(document.querySelectorAll(".table__row")).slice(1);
    const sorted = rows.slice().sort((a, b) => {
      const nameA = norm(a.querySelector('span[id^="rptUsers_"][id$="_ltUserName"]')?.textContent);
      const nameB = norm(b.querySelector('span[id^="rptUsers_"][id$="_ltUserName"]')?.textContent);
      return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    });
    sorted.forEach((row, i) => {
      const input = row.querySelector('input[id^="rptUsers_"][id$="_txtSorting"]');
      if (input) input.value = i + 1;
    });
  }

  function hookFormSubmit() {
    document.querySelectorAll("form").forEach(form => {
      if (form.__tmSortHooked) return;
      form.__tmSortHooked = true;
      form.addEventListener("submit", adjustSortingByAlphabet, true);
    });
  }

  function hookCheckTeamForm() {
    if (typeof window.CheckTeamForm !== "function" || window.CheckTeamForm.__tmWrapped) return;
    const original = window.CheckTeamForm;
    window.CheckTeamForm = function (...args) {
      if (args[0] === "save") adjustSortingByAlphabet();
      return original.apply(this, args);
    };
    window.CheckTeamForm.__tmWrapped = true;
  }

  // Init
  const BTN_SELECTOR = "h2";
  const BTN_ATTRS = {id: BTN_ID, type: "button", class: "btn--default btn--light", style: "margin: 10px 10px 10px 0", text: "Sort by Alphabet"};

  const init = () => {
    addButtonAfter(BTN_SELECTOR, BTN_ATTRS, e => { e.preventDefault(); adjustSortingByAlphabet(); });
    hookFormSubmit();
    hookCheckTeamForm();
  };

  window.addEventListener("load", init);
  new MutationObserver(init).observe(document.documentElement, {childList: true, subtree: true});
})();
