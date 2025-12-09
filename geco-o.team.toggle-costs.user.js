// ==UserScript==
// @name         Team - Show/Hide Costs
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Toggle visibility of cost columns on team page and remember setting in a cookie
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/GeCoO/Project/ManageTeam.aspx?sc=*
// @grant        none
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team.toggle-costs.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team-toggle-costs.user.js
// @run-at       document-end
// ==/UserScript==
// == Changelog ========================================================================================================
// 1.0.0         Initial release

(function () {
    'use strict';

    const COOKIE_NAME = 'tm_team_show_costs';
    const COOKIE_DAYS = 365;

    function setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = '; expires=' + date.toUTCString();
        document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/';
    }

    function getCookie(name) {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    }

    function ensureCustomOptionsContainer() {
        let container = document.getElementById('tampermonkey-custom-options');
        if (container) return container;

        const h2 = document.querySelector('h2');
        if (!h2) return null;

        container = document.createElement('div');
        container.id = 'tampermonkey-custom-options';
        container.style.margin = '10px 0';
        container.style.display = 'flex';
        container.style.gap = '10px';

        h2.insertAdjacentElement('afterend', container);
        return container;
    }

    function updateCostsVisibility(show) {
        const cells = document.querySelectorAll('.real-cost-view, .avg-cost-view');
        const headers = document.querySelectorAll('#plhAvgCpstHeader, #plhRealCostHeader');

        [...cells, ...headers].forEach(el => {
            el.style.display = show ? '' : 'none';
        });
    }

    function setButtonLabel(button, show) {
        button.textContent = show ? 'Hide' : 'Show';
    }

    function initShowHideButton(initialShow) {
        const container = ensureCustomOptionsContainer();
        if (!container) return;

        if (container.querySelector('#tm-btn-show-hide-costs')) return;

        let showCosts = initialShow;

        const button = document.createElement('button');
        button.id = 'tm-btn-show-hide-costs';
        button.type = 'button';
        setButtonLabel(button, showCosts);

        button.addEventListener('click', () => {
            showCosts = !showCosts;
            updateCostsVisibility(showCosts);
            setCookie(COOKIE_NAME, showCosts ? '1' : '0', COOKIE_DAYS);
            setButtonLabel(button, showCosts);
        });

        container.appendChild(button);
        updateCostsVisibility(showCosts);
    }

    function init() {
        const cookieVal = getCookie(COOKIE_NAME);
        const showCosts = cookieVal === null ? true : (cookieVal === '1');
        initShowHideButton(showCosts);
    }

    window.addEventListener('load', init);
})();