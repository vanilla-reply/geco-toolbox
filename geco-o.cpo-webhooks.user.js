// ==UserScript==
// @name         GECO2CPO Webhook
// @namespace    https://geco.reply.com/
// @version      1.2.0
// @description  Sync changes to CPO
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/
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
// 1.1.2    Restrict @match to root URL to avoid loading on RefreshSession pages
// 1.2.0    Replace DOM btn-save handler with XHR interceptor for SavePlanning_1_0

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

    // --- XHR interceptor ---
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
            typeof this._geco2cpo.url === 'string'
        ) {
            const url = this._geco2cpo.url;

            if (url.includes('SavePlanning_1_0')) {
                try {
                    const data = JSON.parse(body);
                    log('intercepted SavePlanning_1_0', data);
                    const gecoProjectId = data?.plc?.[0]?.ProjectSubId;
                    if (gecoProjectId) {
                        postWebhook(ENDPOINTS.syncPlanning, { gecoProjectId });
                    } else {
                        warn('SavePlanning_1_0: missing ProjectSubId in payload');
                    }
                } catch (e) {
                    error('SavePlanning_1_0: failed to parse body', e);
                }
            }

            if (url.includes('SaveProjectTimesheet_1_1')) {
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
        }
        return origSend.call(this, body);
    };

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

})();