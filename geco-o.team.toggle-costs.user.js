// ==UserScript==
// @name         Team - Show/Hide Costs
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Toggle visibility of cost columns on team page and remember setting in a cookie
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/GeCoO/Project/ManageTeam.aspx?sc=*
// @grant        none
// @run-at       document-end
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team.toggle-costs.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team.toggle-costs.user.js
// ==/UserScript==

(function () {
  "use strict";

  const BTN_ID = "tm-btn-toggle-costs";
  const COOKIE_NAME = "tm_team_show_costs";
  const COOKIE_DAYS = 365;

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
    if (!anchor || document.getElementById(btnAttrs.id)) return null;
    const btn = el("button", btnAttrs);
    if (onClick) btn.addEventListener("click", onClick);
    anchor.insertAdjacentElement("afterend", btn);
    return btn;
  };
  /* ============================================= */

  const setCookie = (name, val, days) => {
    const d = new Date(); d.setTime(d.getTime() + days * 864e5);
    document.cookie = `${name}=${encodeURIComponent(val)}; expires=${d.toUTCString()}; path=/`;
  };

  const getCookie = name => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  };

  let showCosts = getCookie(COOKIE_NAME) !== "0";

  function updateVisibility() {
    document.querySelectorAll(".real-cost-view, .avg-cost-view, #plhAvgCpstHeader, #plhRealCostHeader")
      .forEach(el => el.style.display = showCosts ? "" : "none");
  }

  function toggle() {
    showCosts = !showCosts;
    updateVisibility();
    setCookie(COOKIE_NAME, showCosts ? "1" : "0", COOKIE_DAYS);
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.textContent = showCosts ? "Hide Costs" : "Show Costs";
  }

  // Init
  const BTN_SELECTOR = "h2";

  const init = () => {
    const btn = addButtonAfter(BTN_SELECTOR, {
      id: BTN_ID,
      type: "button",
      class: "btn--default btn--light",
      style: "margin: 10px 10px 10px 0",
      text: showCosts ? "Hide Costs" : "Show Costs"
    }, toggle);
    if (btn) updateVisibility();
  };

  window.addEventListener("load", init);
  new MutationObserver(init).observe(document.documentElement, {childList: true, subtree: true});
})();
