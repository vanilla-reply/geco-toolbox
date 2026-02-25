// ==UserScript==
// @name         GECO2CPO Webhook
// @namespace    https://geco.reply.com/
// @version      1.1.1
// @description  Sync changes to CPO
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      cpo.lab.roman-allenstein.de
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.cpo-webhooks.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.cpo-webhooks.user.js
// ==/UserScript==
// == Changelog ========================================================================================================
// 1.0      Initial release
// 1.0.1    Added CPO_BASE and WEBHOOK_URL constants for easier configuration
// 1.1.0    Add timesheet webhook (sync-timesheet), refactor postWebhook to generic endpoint+payload
// 1.1.1    Downgrade missing project ID warning to log on timesheet pages

(function () {
    'use strict';

    const DEBUG = false; // ← auf false setzen für "silent mode"
    const CPO_BASE = DEBUG ? 'http://localhost:8080' : 'https://cpo.lab.roman-allenstein.de';
    const ENDPOINTS = {
        syncPlanning:  '/webhook/sync-planning',
        syncTimesheet: '/webhook/sync-timesheet',
    };

    function log(...args) {
        if (DEBUG) console.log('[GECO2CPO]', ...args);
    }

    function warn(...args) {
        if (DEBUG) console.warn('[GECO2CPO]', ...args);
    }

    function error(...args) {
        if (DEBUG) console.error('[GECO2CPO]', ...args);
    }

    log('userscript loaded on', location.href);

    // --- XHR interceptor for SaveProjectTimesheet_1_1 ---
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._geco2cpo = { method, url };
        return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
        if (
            this._geco2cpo &&
            this._geco2cpo.method === 'POST' &&
            typeof this._geco2cpo.url === 'string' &&
            this._geco2cpo.url.includes('SaveProjectTimesheet_1_1')
        ) {
            try {
                const data = JSON.parse(body);
                log('intercepted SaveProjectTimesheet_1_1', data);
                const gecoEmployeeId = data?.userId;
                const monthRaw = data?.month; // format "M/dd/yyyy"
                if (gecoEmployeeId && monthRaw) {
                    const parts = monthRaw.split('/');
                    const month = Number(parts[0]);
                    const year  = Number(parts[2]);
                    postWebhook(ENDPOINTS.syncTimesheet, { gecoEmployeeId, year, month });
                } else {
                    warn('SaveProjectTimesheet_1_1: missing userId or month', { gecoEmployeeId, monthRaw });
                }
            } catch (e) {
                error('SaveProjectTimesheet_1_1: failed to parse body', e);
            }
        }
        return origSend.call(this, body);
    };

    function getProjectSubIdFromHash(href) {
        try {
            const url = new URL(href);
            const hash = (url.hash || '').replace(/^#/, '');
            const m = hash.match(/(?:^|\/)planning\/projectsub\/(\d+)(?:\/|$)/i);
            return m ? Number(m[1]) : null;
        } catch {
            return null;
        }
    }

    function getProjectIdBestEffort() {
        try {
            const idTop = getProjectSubIdFromHash(window.top.location.href);
            if (idTop) return idTop;
        } catch (_) {}

        const idHere = getProjectSubIdFromHash(window.location.href);
        if (idHere) return idHere;

        try {
            const url = new URL(window.location.href);
            const tb = url.searchParams.get('tb');
            if (tb && /^\d+$/.test(tb)) return Number(tb);
        } catch (_) {}

        return null;
    }

    function postWebhook(endpoint, payload) {
        const url = `${CPO_BASE}${endpoint}`;
        log('POST', url, payload);

        GM_xmlhttpRequest({
            method: 'POST',
            url,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(payload),
            onload: (resp) => {
                log('webhook response', resp.status, resp.responseText);
            },
            onerror: (err) => {
                error('webhook error', err);
            }
        });
    }

    function handleSaveTriggered() {
        const id = getProjectIdBestEffort();
        if (!id) {
            log('No project ID in URL – skipping sync-planning (timesheet saves are handled via XHR interceptor)');
            return;
        }
        postWebhook(ENDPOINTS.syncPlanning, { gecoProjectId: id });
    }

    document.addEventListener(
        'click',
        (e) => {
            const btn = e.target?.closest?.('#btn-save');
            if (!btn) return;
            log('#btn-save click detected (delegated)');
            handleSaveTriggered();
        },
        true
    );

    function patchButtonIfPresent() {
        const btn = document.getElementById('btn-save');
        if (!btn) return false;

        if (btn.dataset.geco2cpoPatched === '1') return true;
        btn.dataset.geco2cpoPatched = '1';

        log('#btn-save patched directly');

        btn.addEventListener(
            'click',
            () => {
                log('#btn-save click detected (direct)');
                handleSaveTriggered();
            },
            true
        );

        return true;
    }

    const onReady = () => {
        patchButtonIfPresent();
        const mo = new MutationObserver(() => patchButtonIfPresent());
        mo.observe(document.documentElement, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
        onReady();
    }
})();