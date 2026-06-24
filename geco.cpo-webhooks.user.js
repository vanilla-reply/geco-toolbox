// ==UserScript==
// @name         GECO2CPO Webhook
// @namespace    https://geco.reply.com/
// @version      1.8.0
// @description  Sync changes to CPO
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/
// @match        https://geco.reply.com/GeCoO/Project/ProjectSub.aspx*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      localhost
// @connect      cpo.vanilla.space
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco.cpo-webhooks.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco.cpo-webhooks.user.js
// ==/UserScript==

// == Changelog ========================================================================================================
// 1.0      Initial release
// 1.0.1    Added CPO_BASE and WEBHOOK_URL constants for easier configuration
// 1.1.0    Add timesheet webhook (sync-timesheet), refactor postWebhook to generic endpoint+payload
// 1.1.1    Downgrade missing project ID warning to log on timesheet pages
// 1.1.2    Restrict @match to root URL to avoid loading on RefreshSession pages
// 1.2.0    Replace DOM btn-save handler with XHR interceptor for SavePlanning_1_0
// 1.2.1    Add @match for ManagePlanning.aspx iframe so XHR interceptor runs there
// 1.3.0    Add budget webhook (sync-budget) via form submit listener on ProjectSub.aspx
// 1.4.0    Fix planning+timesheet webhooks: replace GM_xmlhttpRequest in iframe with postMessage→parent
//          (GM_xmlhttpRequest is unreliable in dynamically-loaded same-origin iframes without src attribute)
//          Remove @match for ManagePlanning.aspx (no longer needed)
// 1.5.0    Fix timesheet webhook: the timesheet ("compiling") page renders "no-iframe" directly in the
//          parent window, so SaveProjectTimesheet_1_1 fires in the parent — not in ifr-page. Patch the
//          page's XHR in the parent via unsafeWindow (sandbox window.XMLHttpRequest != page XHR) and fire
//          the webhook directly. Refactor the open/send patch into a reusable patchXHR(win, direct) used
//          for both parent (direct) and iframe (postMessage) contexts. Add @grant unsafeWindow.
// 1.6.0    Add "GECO EXTENSIONS" entry to the header nav (ul.panels) that opens a status panel showing the
//          active CPO Webhook integration and a persistent Debug on/off toggle (GM_getValue/GM_setValue).
//          DEBUG is now read from storage instead of a hardcoded constant.
// 1.7.0    Turn the GECO EXTENSIONS layer into a generic extension registry: extensions register a card via
//          registerExtension({ id, name, version, description, status, renderBody }). The panel renders one
//          card per registered extension. CPO Webhook is the first registered extension. New extensions can
//          be added by calling registerExtension(...) — no panel changes needed.
// 1.8.0    CPO_BASE now depends on DEBUG (DEBUG=on → localhost, DEBUG=off → prod). Make it a function
//          cpoBase() so toggling DEBUG at runtime takes effect immediately (no reload). Toggling Debug ON
//          logs the currently active CPO_BASE; the panel card re-renders so the shown target/endpoints match.

(function () {
    'use strict';

    // DEBUG ist jetzt persistent (über GECO EXTENSIONS Panel umschaltbar). Default: an.
    let DEBUG = GM_getValue('geco2cpo_debug', true);

    // CPO_BASE hängt von DEBUG ab: DEBUG=an → lokales Tool, DEBUG=aus → Prod.
    // Als Funktion (nicht const), damit das Umschalten von DEBUG zur Laufzeit sofort greift (kein Reload).
    function cpoBase() {
        return DEBUG ? 'http://localhost:8080' : 'https://cpo.vanilla.space';
    }

    const ENDPOINTS = {
        syncPlanning:  '/webhook/sync-planning',
        syncTimesheet: '/webhook/sync-timesheet',
        syncBudget:    '/webhook/sync-budget',
    };

    const VERSION = '1.8.0';

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

    // --- Budget sync (postMessage from iframe → parent fires webhook) ---

    if (location.pathname.includes('ProjectSub.aspx')) {
        // IFRAME: detect save click and notify parent via postMessage
        const params = new URLSearchParams(location.search);
        const referenceId = params.get('sc');

        if (referenceId) {
            document.addEventListener('DOMContentLoaded', () => {
                const btn = document.getElementById('btnSave');
                if (btn) {
                    btn.addEventListener('click', () => {
                        log('ProjectSub.aspx btnSave click → postMessage to parent', { referenceId });
                        window.parent.postMessage({ type: 'geco2cpo-budget', referenceId }, '*');
                    }, true);
                } else {
                    warn('ProjectSub.aspx: btnSave not found');
                }
            });
        } else {
            warn('ProjectSub.aspx: missing sc parameter in URL');
        }

    } else if (location.pathname === '/') {
        // PARENT: receive messages from iframes and fire webhooks

        window.addEventListener('message', (e) => {
            // Budget
            if (e.data?.type === 'geco2cpo-budget' && e.data.referenceId) {
                log('received geco2cpo-budget message from iframe', e.data);
                postWebhook(ENDPOINTS.syncBudget, { referenceId: e.data.referenceId });
            }

            // Planning (kommt aus dem ifr-page iframe)
            if (e.data?.type === 'geco2cpo-planning' && e.data.gecoProjectId) {
                log('received geco2cpo-planning message from iframe', e.data);
                postWebhook(ENDPOINTS.syncPlanning, { gecoProjectId: e.data.gecoProjectId });
            }

            // Timesheet (Fallback, falls aus iframe)
            if (e.data?.type === 'geco2cpo-timesheet' && e.data.gecoEmployeeId) {
                log('received geco2cpo-timesheet message from iframe', e.data);
                postWebhook(ENDPOINTS.syncTimesheet, {
                    gecoEmployeeId: e.data.gecoEmployeeId,
                    year: e.data.year,
                    month: e.data.month,
                });
            }
        });

        // 1.5.0: Timesheet ("compiling") und Planning rendern "no-iframe" direkt im Parent-Window.
        // Deshalb hier den XHR DER SEITE patchen. Wichtig: im Tampermonkey-Sandbox ist
        // window.XMLHttpRequest NICHT der Konstruktor der Seite — daher unsafeWindow nutzen.
        const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        patchXHR(pageWin, true); // direct=true → Webhook direkt feuern (wir sind im Parent)

        // iframe-Fälle (Budget/Planning in ifr-page) weiterhin abdecken.
        const ifr = document.getElementById('ifr-page');
        if (ifr) {
            ifr.addEventListener('load', injectIframeXHRPatch);
        } else {
            // ifr-page existiert ggf. noch nicht bei document-start → DOM beobachten
            const observer = new MutationObserver(() => {
                const el = document.getElementById('ifr-page');
                if (el) {
                    observer.disconnect();
                    el.addEventListener('load', injectIframeXHRPatch);
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        // 1.6.0: "GECO EXTENSIONS" Nav-Eintrag + Status-Panel einhängen
        mountExtensionsUI();
    }

    function injectIframeXHRPatch() {
        const ifr = document.getElementById('ifr-page');
        if (!ifr || !ifr.contentWindow) return;
        log('injecting XHR patch into iframe', ifr.contentWindow.location.pathname);
        patchXHR(ifr.contentWindow, false); // direct=false → postMessage an Parent
    }

    // Patcht XMLHttpRequest.open/send eines gegebenen Window-Objekts.
    //   direct=true  → Treffer feuern den Webhook direkt via postWebhook (Parent-Kontext)
    //   direct=false → Treffer schicken postMessage an den Parent (iframe-Kontext)
    function patchXHR(w, direct) {
        if (!w || !w.XMLHttpRequest) return;
        if (w.__geco2cpoPatched) return; // Doppel-Patch verhindern (z. B. iframe reload)
        w.__geco2cpoPatched = true;

        log('patching XHR', { direct, href: (() => { try { return w.location.href; } catch (e) { return '?'; } })() });

        const origOpen = w.XMLHttpRequest.prototype.open;
        const origSend = w.XMLHttpRequest.prototype.send;

        w.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._geco2cpo = { method, url };
            return origOpen.call(this, method, url, ...rest);
        };

        w.XMLHttpRequest.prototype.send = function (body) {
            const info = this._geco2cpo;
            if (info && info.method === 'POST' && typeof info.url === 'string') {
                const url = info.url;

                if (url.includes('SavePlanning_1_0')) {
                    try {
                        const data = JSON.parse(body);
                        log('intercepted SavePlanning_1_0', data);
                        const gecoProjectId = data?.plc?.[0]?.ProjectSubId;
                        if (gecoProjectId) {
                            if (direct) {
                                postWebhook(ENDPOINTS.syncPlanning, { gecoProjectId });
                            } else {
                                window.parent.postMessage({ type: 'geco2cpo-planning', gecoProjectId }, '*');
                            }
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
                            if (direct) {
                                postWebhook(ENDPOINTS.syncTimesheet, { gecoEmployeeId, year, month });
                            } else {
                                window.parent.postMessage({ type: 'geco2cpo-timesheet', gecoEmployeeId, year, month }, '*');
                            }
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
    }

    function postWebhook(endpoint, payload) {
        const url = `${cpoBase()}${endpoint}`;
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

    // === GECO EXTENSIONS UI ==========================================================================================

    // Registry: jede Extension trägt sich als Karte ein.
    // Schema: { id, name, version, description, status: 'on'|'off', renderBody(container) }
    const EXTENSIONS = [];

    function registerExtension(ext) {
        EXTENSIONS.push(ext);
        // Falls das Panel gerade offen ist, neu rendern, damit die Karte sofort erscheint.
        if (document.getElementById('geco2cpo-overlay')) {
            renderExtensionCards(document.getElementById('geco2cpo-cards'));
        }
    }

    // --- CPO Webhook als erste Extension registrieren ---
    registerExtension({
        id: 'cpo-webhook',
        name: 'CPO Webhook',
        version: VERSION,
        status: 'on',
        description: 'Synchronisiert Timesheet-, Planning- und Budget-Änderungen aus GECO an CPO.',
        renderBody(container) {
            const endpointRows = Object.entries(ENDPOINTS)
                .map(([key, path]) => `
                    <tr>
                        <td class="geco2cpo-k">${key}</td>
                        <td class="geco2cpo-v"><code>${cpoBase()}${path}</code></td>
                    </tr>`)
                .join('');

            container.innerHTML = `
                <div class="geco2cpo-row">
                    <span class="geco2cpo-row-k">Ziel (CPO_BASE)</span>
                    <code>${cpoBase()}</code>
                </div>
                <table class="geco2cpo-endpoints">${endpointRows}</table>
                <label class="geco2cpo-toggle">
                    <input type="checkbox" id="geco2cpo-debug-toggle" ${DEBUG ? 'checked' : ''}>
                    <span>Debug-Logging in der Konsole</span>
                    <strong id="geco2cpo-debug-state">${DEBUG ? 'AN' : 'AUS'}</strong>
                </label>
                <p class="geco2cpo-hint">
                    Bei aktivem Debug werden abgefangene Saves und Webhook-Antworten als
                    <code>[GECO2CPO]</code>-Logs ausgegeben. <strong>Hinweis:</strong> Debug=AN nutzt
                    <code>localhost:8080</code>, Debug=AUS die Prod-URL. Einstellung bleibt nach Reload erhalten.
                </p>
            `;

            const toggle = container.querySelector('#geco2cpo-debug-toggle');
            toggle.addEventListener('change', () => {
                DEBUG = toggle.checked;
                GM_setValue('geco2cpo_debug', DEBUG);
                // bewusst console.log (nicht log()), damit die Bestätigung auch beim Ausschalten erscheint
                console.log('[GECO2CPO] debug set to', DEBUG);
                if (DEBUG) console.log('[GECO2CPO] aktuell gültige CPO_BASE:', cpoBase());
                // Karte neu rendern, damit Ziel (CPO_BASE) und Endpoints den neuen Wert zeigen
                renderExtensionCards(document.getElementById('geco2cpo-cards'));
            });
        },
    });

    function mountExtensionsUI() {
        injectExtensionsStyles();

        // Auf das Header-Menü warten (existiert bei document-start noch nicht).
        const panels = document.querySelector('ul.panels');
        if (panels) {
            addExtensionsNavItem(panels);
        } else {
            const obs = new MutationObserver(() => {
                const el = document.querySelector('ul.panels');
                if (el) {
                    obs.disconnect();
                    addExtensionsNavItem(el);
                }
            });
            obs.observe(document.documentElement, { childList: true, subtree: true });
        }
    }

    function addExtensionsNavItem(panels) {
        if (panels.querySelector('#geco2cpo-nav')) return; // Doppel-Insert verhindern

        const li = document.createElement('li');
        li.id = 'geco2cpo-nav';
        li.setAttribute('data-geco', 'ext');

        const a = document.createElement('a');
        a.href = '#';
        a.textContent = 'GECO EXTENSIONS';
        a.addEventListener('click', (e) => {
            e.preventDefault();
            toggleExtensionsPanel();
        });

        li.appendChild(a);
        panels.appendChild(li);
        log('GECO EXTENSIONS nav item added');
    }

    function toggleExtensionsPanel() {
        const existing = document.getElementById('geco2cpo-overlay');
        if (existing) {
            existing.remove();
            return;
        }
        renderExtensionsPanel();
    }

    function renderExtensionsPanel() {
        const overlay = document.createElement('div');
        overlay.id = 'geco2cpo-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const dialog = document.createElement('div');
        dialog.id = 'geco2cpo-dialog';
        dialog.innerHTML = `
            <div class="geco2cpo-head">
                <h2>GECO Extensions</h2>
                <button type="button" class="geco2cpo-close" title="Schließen">×</button>
            </div>
            <div id="geco2cpo-cards"></div>
        `;
        dialog.querySelector('.geco2cpo-close').addEventListener('click', () => overlay.remove());

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        renderExtensionCards(dialog.querySelector('#geco2cpo-cards'));
    }

    // Rendert pro registrierter Extension eine Karte in den gegebenen Container.
    function renderExtensionCards(cards) {
        if (!cards) return;
        cards.innerHTML = '';

        if (!EXTENSIONS.length) {
            cards.innerHTML = '<p class="geco2cpo-empty">Keine Extensions registriert.</p>';
            return;
        }

        EXTENSIONS.forEach((ext) => {
            const card = document.createElement('div');
            card.className = 'geco2cpo-card';

            const on = ext.status !== 'off';
            const head = document.createElement('div');
            head.className = 'geco2cpo-card-head';
            head.innerHTML = `
                <span class="geco2cpo-badge ${on ? 'geco2cpo-badge--on' : 'geco2cpo-badge--off'}">${on ? 'AKTIV' : 'INAKTIV'}</span>
                <span class="geco2cpo-title">${ext.name}</span>
                ${ext.version ? `<span class="geco2cpo-ver">v${ext.version}</span>` : ''}
            `;
            card.appendChild(head);

            if (ext.description) {
                const desc = document.createElement('p');
                desc.className = 'geco2cpo-desc';
                desc.textContent = ext.description;
                card.appendChild(desc);
            }

            // Extension-spezifischer Inhalt (Controls etc.)
            if (typeof ext.renderBody === 'function') {
                const body = document.createElement('div');
                body.className = 'geco2cpo-card-body';
                try {
                    ext.renderBody(body);
                } catch (e) {
                    error('extension renderBody failed', ext.id, e);
                    body.innerHTML = '<p class="geco2cpo-hint">Fehler beim Rendern dieser Extension.</p>';
                }
                card.appendChild(body);
            }

            cards.appendChild(card);
        });
    }

    function injectExtensionsStyles() {
        if (document.getElementById('geco2cpo-styles')) return;
        const style = document.createElement('style');
        style.id = 'geco2cpo-styles';
        style.textContent = `
            #geco2cpo-overlay {
                position: fixed; inset: 0; z-index: 99998;
                background: rgba(0,0,0,0.45);
                display: flex; align-items: flex-start; justify-content: center;
                padding-top: 90px;
            }
            #geco2cpo-dialog {
                width: 520px; max-width: calc(100% - 40px);
                background: #fff; border-radius: 6px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.35);
                color: #333; font-family: inherit; font-size: 13px;
                overflow: hidden;
            }
            #geco2cpo-dialog .geco2cpo-head {
                display: flex; align-items: center; justify-content: space-between;
                background: #79c143; color: #fff; padding: 12px 16px;
            }
            #geco2cpo-dialog .geco2cpo-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
            #geco2cpo-dialog .geco2cpo-close {
                border: 0; background: transparent; color: #fff;
                font-size: 22px; line-height: 1; cursor: pointer; padding: 0 2px;
            }
            #geco2cpo-dialog .geco2cpo-close:hover { opacity: .8; }
            #geco2cpo-dialog #geco2cpo-cards { max-height: 70vh; overflow-y: auto; }
            #geco2cpo-dialog .geco2cpo-card { padding: 16px; }
            #geco2cpo-dialog .geco2cpo-card + .geco2cpo-card { border-top: 6px solid #f0f0f0; }
            #geco2cpo-dialog .geco2cpo-empty { padding: 24px 16px; color: #999; text-align: center; margin: 0; }
            #geco2cpo-dialog .geco2cpo-card-head {
                display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
            }
            #geco2cpo-dialog .geco2cpo-title { font-size: 15px; font-weight: 600; }
            #geco2cpo-dialog .geco2cpo-ver { color: #999; font-size: 12px; margin-left: auto; }
            #geco2cpo-dialog .geco2cpo-badge {
                font-size: 11px; font-weight: 700; letter-spacing: .04em;
                padding: 2px 7px; border-radius: 10px; color: #fff;
            }
            #geco2cpo-dialog .geco2cpo-badge--on { background: #79c143; }
            #geco2cpo-dialog .geco2cpo-badge--off { background: #bbb; }
            #geco2cpo-dialog .geco2cpo-desc { margin: 0 0 12px; color: #555; line-height: 1.45; }
            #geco2cpo-dialog .geco2cpo-row {
                display: flex; align-items: center; justify-content: space-between;
                padding: 6px 0; border-top: 1px solid #eee;
            }
            #geco2cpo-dialog .geco2cpo-row-k { color: #777; }
            #geco2cpo-dialog code {
                background: #f4f4f4; padding: 1px 5px; border-radius: 3px;
                font-size: 12px; color: #444;
            }
            #geco2cpo-dialog .geco2cpo-endpoints {
                width: 100%; border-collapse: collapse; margin: 8px 0 14px;
            }
            #geco2cpo-dialog .geco2cpo-endpoints td { padding: 4px 0; vertical-align: top; }
            #geco2cpo-dialog .geco2cpo-k { color: #777; width: 130px; }
            #geco2cpo-dialog .geco2cpo-toggle {
                display: flex; align-items: center; gap: 8px;
                margin-top: 6px; padding: 10px 12px;
                background: #f7faf3; border: 1px solid #e2eed6; border-radius: 4px;
                cursor: pointer; font-weight: 500;
            }
            #geco2cpo-dialog .geco2cpo-toggle input { margin: 0; }
            #geco2cpo-dialog .geco2cpo-toggle strong { margin-left: auto; color: #79c143; }
            #geco2cpo-dialog .geco2cpo-hint { color: #888; font-size: 11px; margin: 8px 0 0; line-height: 1.4; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

})();
