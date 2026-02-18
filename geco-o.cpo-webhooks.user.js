// ==UserScript==
// @name         GECO2CPO Webhook
// @namespace    https://geco.reply.com/
// @version      1.0
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

(function () {
    'use strict';

    const DEBUG = false; // ← auf false setzen für "silent mode"
    const WEBHOOK_URL = 'http://localhost:8080/webhook/sync-planning'; // https://cpo.lab.roman-allenstein.de/webhook/sync-planning

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

    function postWebhook(gecoProjectId) {
        log('POST webhook with gecoProjectId=', gecoProjectId);

        GM_xmlhttpRequest({
            method: 'POST',
            url: WEBHOOK_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ gecoProjectId }),
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
            warn('Could not determine project ID (projectsub/tb missing)');
            return;
        }
        postWebhook(id);
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