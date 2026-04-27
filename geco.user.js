// ==UserScript==
// @name         Geco-T Booking Modal(2025)
// @namespace    https://geco.reply.com/
// @version      3.29
// @description  Tweaks for our precious Geco
// @author       sku, fsf, dkr, pna, fro, dor, r.allenstein@reply.de
// @match        https://geco.reply.com/*
// @match        https://geco.reply.eu/*
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco.user.js
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==

/*jshint multistr:true */

// ---------------------------------------------------------------------------------------------------------------
// URL params / debug
// ---------------------------------------------------------------------------------------------------------------
var debug;
var params = {};
var start = window.location.href.indexOf("?");
var parts = window.location.href.substring(start + 1).split('&');

for (var i = 0; i < parts.length; i++) {
    var nv = parts[i].split('=');
    if (!nv[0]) continue;
    params[nv[0]] = nv[1] || true;
}

if (params.debugBeauty === "true") {
    debug = true;
}

debug && console.log("debugging mode on Beautifier.");

// ---------------------------------------------------------------------------------------------------------------
// user config
// ---------------------------------------------------------------------------------------------------------------
var GecoConfigDefaults = {
    dayStartTime: '08:30',
    dayEndTime: '17:30',
    breakMinutes: 45,
    breakMode: 'auto',
    enableFixedEndTime: true
};

var GecoConfig = {
    version: typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version ? GM_info.script.version : '3.27',

    get: function(key) {
        if (typeof GM_getValue === 'undefined') {
            return GecoConfigDefaults[key];
        }

        return GM_getValue(key, GecoConfigDefaults[key]);
    },

    set: function(key, value) {
        if (typeof GM_setValue === 'undefined') {
            return;
        }

        GM_setValue(key, value);
    },

    getDayStartTime: function() {
        return this.get('dayStartTime');
    },

    getDayEndTime: function() {
        return this.get('dayEndTime');
    },

    getBreakMinutes: function() {
        var value = parseInt(this.get('breakMinutes'), 10);
        return isNaN(value) ? GecoConfigDefaults.breakMinutes : value;
    },

    getBreakMode: function() {
        var value = this.get('breakMode');

        if (value !== 'fixed' && value !== 'auto') {
            return GecoConfigDefaults.breakMode;
        }

        return value;
    },

    getBreakMinutesForHours: function(totalHours) {
        if (this.getBreakMode() === 'fixed') {
            return this.getBreakMinutes();
        }

        return totalHours <= 9 ? 30 : 45;
    },

    isFixedEndTimeEnabled: function() {
        var value = this.get('enableFixedEndTime');
        return value === true || value === 'true';
    },

    saveFromDialog: function($dialog) {
        this.set('dayStartTime', $dialog.find('input[name="dayStartTime"]').val());
        this.set('dayEndTime', $dialog.find('input[name="dayEndTime"]').val());
        this.set('breakMinutes', parseInt($dialog.find('input[name="breakMinutes"]').val(), 10));
        this.set('breakMode', $dialog.find('input[name="breakMode"]:checked').val());
        this.set('enableFixedEndTime', $dialog.find('input[name="enableFixedEndTime"]').is(':checked'));
    },

    reset: function() {
        this.set('dayStartTime', GecoConfigDefaults.dayStartTime);
        this.set('dayEndTime', GecoConfigDefaults.dayEndTime);
        this.set('breakMinutes', GecoConfigDefaults.breakMinutes);
        this.set('breakMode', GecoConfigDefaults.breakMode);
        this.set('enableFixedEndTime', GecoConfigDefaults.enableFixedEndTime);
    }
};

// ---------------------------------------------------------------------------------------------------------------
// main geco extension
// ---------------------------------------------------------------------------------------------------------------
var GecoExtension = {
    options: {
        version: GecoConfig.version,
        oldLineExpr: /^([^;]*)?;([^;]*)?;([0-9,.]*);(.*)$/,
        oldLineSplitter: '|',
        lineExpr: /^([^;]*)?;([^;]*)?;([0-9,.]*);([^;]*);(.+)$/,
        lineSplitter: '|',
        autofiller: {
            'db': ['', '', 1, 'Daily Business', '']
        }
    },

    dataStorage: null,
    intervalId: null,
    summaryObserver: null,

    run: function() {
        var self = this;

        setInterval(function() {
            if ($('.page__content').length) {
                self._init();
            }
        }, 500);
    },

    _init: function() {
        if ($('#geco-extension').length) return;

        this._addExtensionEnableCheckbox();
        this._applyStyles();

        if (parseInt(this._getCookie('geco-extension'))) {
            this._enableExtension();
        }
    },

    _setCookie: function(cname, cvalue, exdays) {
        var d = new Date();
        d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
        var expires = "expires=" + d.toUTCString();
        document.cookie = cname + "=" + cvalue + "; " + expires;
    },

    _getCookie: function(cname) {
        var name = cname + "=";
        var ca = document.cookie.split(';');

        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];

            while (c.charAt(0) == ' ') {
                c = c.substring(1);
            }

            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }

        return "";
    },

    _applyStyles: function() {
        if ($('#geco-fe-styles').length) return;

        var styles = '<style type="text/css" id="geco-fe-styles"> \
            .geco-fe-enabled .editbox { width: 360px !important; max-width: 360px !important; padding-bottom: 0; } \
            .geco-fe-enabled .editbox p { width: 65px; } \
            .geco-fe-enabled .editbox input[type="text"], .geco-fe-enabled .editbox textarea { width: 280px !important; } \
            .geco-fe-enabled .editbox input[type="text"][disabled], .geco-fe-enabled .editbox textarea[disabled] { color: #999 !important; } \
            .geco-fe-enabled .editbox input.readonly { border-color: white; box-shadow: none; padding: 2px 0 0; height: 20px; margin-left: -10px; } \
            .geco-fe-enabled .editbox .selectbox { width: 289px !important; margin-left: -1px; } \
            .geco-fe-enabled .table__cell[data-status="1"] { background-color: #54C9EA !important; border-width: 0; color: white; } \
            .geco-fe-enabled .table__cell[data-status="2"] { background-color: #79c143 !important; border-width: 0; color: white; } \
            .geco-fe-enabled .table__cell[data-status="3"] { background-color: #F06EAA !important; border-width: 0; color: white; } \
            .geco-fe-enabled .table__cell[data-status="1"] > div, .table__cell[data-status="2"] > div, .table__cell[data-status="3"] > div { color: white; } \
            .geco-fe-enabled .table__cell > div input, .geco-fe-enabled .table__cell > div textarea { color: black; } \
            .geco-fe-enabled .task-extension { overflow: hidden; position: relative; text-align: left; padding: 5px 10px 0px 77px; margin: -5px -10px -10px -10px; } \
            .geco-fe-enabled .task-extension.current { background-color: rgba(121,193,67,0.6) !important; } \
            .geco-fe-enabled .task-extension a.icon { position: absolute; width: 40px; height: 12px; left: 10px; color: #000; font-size: 9px; opacity: 0.65; overflow: hidden; text-decoration: none; } \
            .geco-fe-enabled .task-extension a.icon:hover { opacity: 1; } \
            .geco-fe-enabled .task-extension a.icon.copy { top: 11px; } \
            .geco-fe-enabled .task-extension a.icon.cut { top: 28px; } \
            .geco-fe-enabled .task-extension a.icon.delete { top: 45px; } \
            .geco-fe-enabled .task-extension a.icon.paste { top: 11px; } \
            .geco-fe-enabled .editbox .editbox__field:nth-child(even) .task-extension { background-color: rgba(121,193,67,0.1); } \
            .geco-fe-enabled .editbox .editbox__field:nth-child(odd) .task-extension { background-color: rgba(121,193,67,0.2); } \
            .geco-fe-enabled .task-extension input.inputbox.ticket { width: 70px !important; margin-right: 3px; margin-bottom: 5px; } \
            .geco-fe-enabled .task-extension input.inputbox.package { width: 150px !important; margin-bottom: 5px; } \
            .geco-fe-enabled .task-extension input.inputbox.hours { width: 30px !important; margin-right: 3px; margin-bottom: 5px; } \
            .geco-fe-enabled .task-extension input.inputbox.task { width: 280px !important; margin-right: 3px; margin-bottom: 5px; } \
            .geco-fe-enabled .task-extension input.inputbox.epicKey { background-color: #efefef; width: 60px !important; margin-right: 3px; margin-bottom: 5px; display: none; } \
            .geco-fe-enabled .table--hours .activity__lev1 .table__cell, .geco-fe-enabled .table--activity .activity__lev1 { background-color: rgba(0,0,0,.1); } \
            .geco-fe-enabled .table--hours .activity__lev2 .table__cell, .geco-fe-enabled .table--activity .activity__lev2 { background-color: rgba(0,0,0,.05); } \
            .geco-fe-enabled .table--hours .table__cell--summary + .table__cell::after { content: ""; width: 2px; background-color: #bababa; height: 100%; display: block; top: 0; position: absolute; margin-left: -1px; } \
            .geco-fe-enabled .table__cell.current-day { background-color: rgb(241,78,79); } \
            .geco-fe-enabled .table--hours .table__cell.current-day { background-color: rgba(241,78,79,0.2); } \
            .geco-fe-enabled .table--hours .activity__lev1 .table__cell.current-day { background-color: #e5c4c6; } \
            .geco-fe-enabled .table--hours .activity__lev2 .table__cell.current-day { background-color: #f2cfd1; } \
            .geco-fe-enabled .table__cell.current-day b, .geco-fe-enabled .table__cell.current-day i { color: #FFF !important; } \
            .geco-fe-enabled #notes-to-add.inactive { background-color: #efefef; height: 24px; } \
            .geco-fe-enabled #notes-to-add.inactive:focus { height: 50px; } \
            .geco-fe-checkbox-container { position: absolute; font-size: 11px; display: flex; align-items: center; gap: 3px; margin-top: -5px; } \
            .geco-fe-checkbox-container input#geco-extension { float: left; margin-top: 0; } \
            .geco-fe-checkbox-container label[for="geco-extension"] { display: inline-block; padding:0 0 0 3px; line-height: normal; } \
            .geco-fe-checkbox-container strong.geco { color: #a2a2a2; } \
            .geco-fe-checkbox-container strong.geco span { color: #79c143; } \
            .geco-fe-settings-button { border: 0; background: transparent; cursor: pointer; font-size: 16px; line-height: 16px; padding: 0 0 0 5px; vertical-align: middle; } \
            .geco-fe-settings-button:hover { opacity: 0.75; } \
            .geco-fe-settings-overlay { position: fixed; z-index: 99998; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.35); } \
            .geco-fe-settings-dialog { position: fixed; z-index: 99999; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 390px; background: #fff; border-radius: 4px; box-shadow: 0 2px 18px rgba(0,0,0,0.35); padding: 16px; color: #333; font-size: 13px; text-align: left; } \
            .geco-fe-settings-dialog h3 { margin: 0 0 12px 0; font-size: 16px; line-height: 20px; } \
            .geco-fe-settings-dialog label { display: block; margin: 10px 0 4px 0; line-height: normal; } \
            .geco-fe-settings-dialog input[type="text"], .geco-fe-settings-dialog input[type="number"] { width: 100%; box-sizing: border-box; padding: 5px; } \
            .geco-fe-settings-dialog .geco-fe-settings-checkbox { margin-top: 12px; } \
            .geco-fe-settings-dialog .geco-fe-settings-checkbox input { margin-right: 5px; } \
            .geco-fe-settings-dialog .geco-fe-settings-radio { margin: 0; padding-top: 0; font-weight: normal; } \
            .geco-fe-settings-dialog .geco-fe-settings-radio input { margin-right: 5px; } \
            .geco-fe-settings-dialog .geco-fe-settings-hint { color: #777; font-size: 11px; margin-top: 8px; line-height: 15px; } \
            .geco-fe-settings-dialog .geco-fe-settings-actions { text-align: right; margin-top: 16px; } \
            .geco-fe-settings-dialog button { margin-left: 6px; cursor: pointer; } \
        </style>';

        $('head').append(styles);
    },

    _addExtensionEnableCheckbox: function() {
        var self = this;
        var cVal = parseInt(this._getCookie('geco-extension'));
        var $chkbox = $('<input type="checkbox" value="1" id="geco-extension" />');

        if (cVal) {
            $chkbox.prop('checked', true);
        }

        $chkbox.on('change.geco', function() {
            var isChecked = $(this).is(':checked');
            isChecked ? self._enableExtension() : self._disableExtension();
            self._setCookie('geco-extension', isChecked ? 1 : 0, 30);
        });

        $chkbox.insertBefore('.page__content .tables-wrap .timesheet-action');
        $chkbox.wrap('<div class="geco-fe-checkbox-container"></div>');
        $chkbox.after('<label for="geco-extension">Enable <strong class="geco">ge<span>co</span></strong> frontend extension (v' + this.options.version + ')</label>');
        $chkbox.closest('.geco-fe-checkbox-container').append('<button type="button" class="geco-fe-settings-button" title="GECO Toolbox Einstellungen">⚙</button>');
        $chkbox.closest('.geco-fe-checkbox-container').on('click.geco', '.geco-fe-settings-button', $.proxy(this._openSettingsDialog, this));
    },

    _openSettingsDialog: function() {
        $('.geco-fe-settings-overlay, .geco-fe-settings-dialog').remove();

        var fixedEndTimeChecked = GecoConfig.isFixedEndTimeEnabled() ? ' checked="checked"' : '';
        var fixedBreakChecked = GecoConfig.getBreakMode() === 'fixed' ? ' checked="checked"' : '';
        var autoBreakChecked = GecoConfig.getBreakMode() === 'auto' ? ' checked="checked"' : '';

        var $overlay = $('<div class="geco-fe-settings-overlay"></div>');
        var $dialog = $('' +
            '<div class="geco-fe-settings-dialog">' +
            '<h3>GECO Toolbox Settings</h3>' +

            '<label for="geco-fe-day-start-time">Start time</label>' +
            '<input type="text" id="geco-fe-day-start-time" name="dayStartTime" value="' + GecoConfig.getDayStartTime() + '" placeholder="08:30" />' +

            '<label for="geco-fe-day-end-time">End time</label>' +
            '<input type="text" id="geco-fe-day-end-time" name="dayEndTime" value="' + GecoConfig.getDayEndTime() + '" placeholder="17:30" />' +

            '<label class="geco-fe-settings-checkbox">' +
            '<input type="checkbox" name="enableFixedEndTime"' + fixedEndTimeChecked + ' /> Use fixed end time' +
            '</label>' +

            '<div class="geco-fe-settings-hint">' +
            'If fixed end time is enabled, the configured end time will always be used. ' +
            'If it is disabled, the end time will be calculated from start time + booked hours + break. ' +
            'The booked hours are read from the daily summary.' +
            '</div>' +

            '<div class="geco-fe-break-rule-settings"' + (GecoConfig.isFixedEndTimeEnabled() ? ' style="display:none;"' : '') + '>' +
            '<label>Break rule</label>' +

            '<label class="geco-fe-settings-radio">' +
            '<input type="radio" name="breakMode" value="auto"' + autoBreakChecked + ' /> Automatic: up to 9h = 30 minutes, over 9h = 45 minutes' +
            '</label>' +

            '<label class="geco-fe-settings-radio">' +
            '<input type="radio" name="breakMode" value="fixed"' + fixedBreakChecked + ' /> Use fixed break duration' +
            '</label>' +

            '<label for="geco-fe-break-minutes">Fixed break duration in minutes</label>' +
            '<input type="number" id="geco-fe-break-minutes" name="breakMinutes" value="' + GecoConfig.getBreakMinutes() + '" min="0" step="1" />' +
            '</div>' +

            '<div class="geco-fe-settings-actions">' +
            '<button type="button" class="btn-flat geco-fe-settings-reset">Reset</button>' +
            '<button type="button" class="btn-flat geco-fe-settings-cancel">Cancel</button>' +
            '<button type="button" class="btn-flat btn-flat--blue geco-fe-settings-save">Save</button>' +
            '</div>' +
            '</div>'
        );

        $('body').append($overlay).append($dialog);

        $overlay.on('click.geco', $.proxy(this._closeSettingsDialog, this));
        $dialog.on('click.geco', '.geco-fe-settings-cancel', $.proxy(this._closeSettingsDialog, this));
        $dialog.on('click.geco', '.geco-fe-settings-save', $.proxy(this._saveSettingsDialog, this));
        $dialog.on('click.geco', '.geco-fe-settings-reset', $.proxy(this._resetSettingsDialog, this));
        $dialog.on('change.geco', 'input[name="enableFixedEndTime"]', function() {
            $dialog.find('.geco-fe-break-rule-settings').toggle(!$(this).is(':checked'));
        });
    },

    _closeSettingsDialog: function() {
        $('.geco-fe-settings-overlay, .geco-fe-settings-dialog').remove();
    },

    _saveSettingsDialog: function() {
        var $dialog = $('.geco-fe-settings-dialog');
        var breakMinutes = $dialog.find('input[name="breakMinutes"]').val();

        if (!this._isValidTime($dialog.find('input[name="dayStartTime"]').val())) {
            alert('Bitte eine gültige Startzeit im Format HH:MM eingeben, z. B. 08:30.');
            return;
        }

        if (!this._isValidTime($dialog.find('input[name="dayEndTime"]').val())) {
            alert('Bitte eine gültige Endzeit im Format HH:MM eingeben, z. B. 17:30.');
            return;
        }

        if (!breakMinutes.match(/^\d+$/)) {
            alert('Bitte eine gültige Pausenzeit in Minuten eingeben, z. B. 45.');
            return;
        }

        if (!$dialog.find('input[name="breakMode"]:checked').length) {
            alert('Bitte eine Pausenregel auswählen.');
            return;
        }

        GecoConfig.saveFromDialog($dialog);
        this._closeSettingsDialog();

        if ($('body').hasClass('geco-fe-enabled')) {
            this._initDayStartTimes();
            this._fillDayTimes();
        }
    },

    _resetSettingsDialog: function() {
        GecoConfig.reset();
        this._closeSettingsDialog();
        this._openSettingsDialog();
    },

    _isValidTime: function(value) {
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    },

    _enableExtension: function() {
        this._highlightCurrentDay();
        this._initDayStartTimes();
        this._observeSummaryHours();

        $('body').addClass('geco-fe-enabled');

        var self = this;

        $(document).off('keydown');

        this.intervalId = setInterval(function() {
            var $editbox = $('.table--hours .table__cell.openend-cell .editbox:not(.geco-fe-extended)');

            if ($editbox.length && !$editbox.hasClass('geco-fe-extended')) {
                self.$editbox = $editbox;
                self.$editbox.addClass('geco-fe-extended');
                self._extendInputFields();
            }
        }, 200);
    },

    _disableExtension: function() {
        clearInterval(this.intervalId);

        if (this.summaryObserver) {
            this.summaryObserver.disconnect();
            this.summaryObserver = null;
        }

        $('.editbox .task-extension').parent().remove();
        $('button.button-action.btn-days-conf-save').remove();
        $('select.geco-fe-confirm-filter').remove();

        $('#modal-month-conf').off('change.geco');

        $('body').removeClass('geco-fe-enabled');
    },

    _highlightCurrentDay: function() {
        var d = new Date();
        var monthStr = d.toLocaleString(navigator.language || 'en', { "month": "long" }) + ' ' + (d.getYear() + 1900);
        var idx = 0;

        if ($('#ts-navigation input').val() !== monthStr) {
            return;
        }

        $('.table--days .table__cell').each(function(i) {
            var day = $(this).find('b').text();

            if (day == d.getDate()) {
                idx = i;
            }
        });

        idx += 1;

        $('.table--days .table__cell:nth-child(' + idx + ')').addClass('current-day');
        $('.table--hours .table__row .table__cell:nth-child(' + idx + ')').addClass('current-day');
    },

    _extendInputFields: function(noFieldFocus) {
        var $ta = this.$editbox.find('#notes-to-add');
        var $hours = this.$editbox.find('#hours-to-add');
        var text = $.trim($ta.val());
        var lines = text.split(this.options.lineSplitter);
        var isDisabled = ($ta.prop('disabled'));
        var r;
        var ticket;
        var package;
        var hours;
        var task;
        var epicKey;
        var self = this;

        if (text.length > 0 && text.match(this.options.oldLineExpr)) {
            lines = text.split(this.options.oldLineSplitter);

            var wasModified = false;

            for (var l = 0; l < (lines.length - 1); l++) {
                if (lines[l].match(this.options.lineExpr)) {
                    continue;
                }

                r = lines[l].match(this.options.oldLineExpr);
                ticket = (r && r[2] != '0') ? r[2] : '';
                package = (r && r[1] != '0') ? r[1] : '';
                hours = r ? r[3] : '';
                task = r ? r[4] : '';
                epicKey = '';

                lines[l] = this._createLine(ticket, package, hours, task, epicKey);
                wasModified = true;
            }

            if (wasModified) {
                text = lines.join(this.options.lineSplitter);
                $ta.val(text);
                this.$editbox.parent().first().addClass('modified');

                if (this.$editbox.parent().find('i.marker').length === 0) {
                    this.$editbox.parent().first().append($('<i class="marker"></i>'));
                }

                $('.alert.alert--modified').show();
            }
        }

        if ($hours.prop('tagName') == 'SELECT' || (text.length > 0 && !text.match(this.options.lineExpr))) {
            return;
        }

        this.$editbox.on('click.geco', 'a.icon.delete', $.proxy(this._deleteEntry, this));
        this.$editbox.on('click.geco', 'a.icon.cut, a.icon.copy', $.proxy(this._copyOrCutEntry, this));
        this.$editbox.on('click.geco', 'a.icon.paste', $.proxy(this._pasteEntry, this));

        this.$editbox.find('#hours-to-add').addClass('readonly').attr('readonly', 'readonly');
        $ta.addClass('inactive');

        this.$editbox.find('.task-extension').remove();

        for (var l2 = 0; l2 < lines.length; l2++) {
            if (lines[l2] !== '') {
                r = lines[l2].match(this.options.lineExpr);
                ticket = (r && r[2] != '0') ? r[2] : '';
                package = (r && r[1] != '0') ? r[1] : '';
                hours = r ? r[3] : '';
                task = r ? r[4] : '';
                epicKey = r ? (r[5] && r[5] != '0' ? r[5] : '') : '';
            } else {
                hours = task = ticket = package = epicKey = '';

                if (isDisabled) {
                    continue;
                }
            }

            var $te = $('<div class="task-extension"></div>');

            $te.append('<input type="text" name="epicKey" class="inputbox epicKey inactive" value="' + epicKey + '" placeholder="Epic-Key" readonly="readonly" />');
            $te.append('<input type="text" name="ticket" class="inputbox ticket" value="' + ticket + '" placeholder="Ticket" />');
            $te.append('<input type="text" name="hours" class="inputbox hours" value="' + hours + '" placeholder="h" />');
            $te.append('<input type="text" name="package" class="inputbox package" value="' + package + '" placeholder="Work package (optional)" />');
            $te.append('<input type="text" name="task" class="inputbox task" value="' + task + '" placeholder="Task description" />');

            if (l2 < lines.length - 1) {
                $te.append('<a href="javascript:;" class="icon copy" title="Copy current entry" tabindex="-1">Copy</a>');
                $te.append('<a href="javascript:;" class="icon cut" title="Cut current entry" tabindex="-1">Cut</a>');
                $te.append('<a href="javascript:;" class="icon delete" title="Delete current entry" tabindex="-1">Delete</a>');
            } else if (this.dataStorage) {
                $te.append('<a href="javascript:;" class="icon paste" title="Paste entry">Paste</a>');
            }

            if (l2 == lines.length - 1) {
                $te.find('input.package').on('blur.geco', $.proxy(this._autofill, this));
                $te.addClass('current');
            }

            $te.insertAfter(this.$editbox.find('.editbox__field').last());
            $te.wrap('<div class="editbox__field"></div>');

            if (isDisabled) {
                $te.find('input[type="text"]').prop('disabled', true);
            }
        }

        setTimeout(function() {
            self.$editbox.find('.editbox__field:last .task-extension input.ticket').focus();
        }, 300);

        $(document).on('keyup.geco blur.geco', '.task-extension input', $.proxy(this._inputChange, this));
        $(document).on('click.geco', '.task-extension input', $.proxy(this._inputClick, this));
    },

    _autofill: function(e) {
        var $fld = $(e.currentTarget);
        var $parent = $fld.parent();
        var v = $fld.val();

        if (!this.options.autofiller || !this.options.autofiller[v]) {
            return;
        }

        var aValues = this.options.autofiller[v];

        $parent.find('input.package').val(aValues[0]);
        $parent.find('input.ticket').val(aValues[1]);
        $parent.find('input.hours').val(aValues[2]);
        $parent.find('input.task').val(aValues[3]);
        $parent.find('input.epicKey').val(aValues[4]);

        this._updateText();
        this._extendInputFields();
    },

    _createLine: function(ticket, package, hours, task, epicKey) {
        if (ticket === '') ticket = '0';
        if (package === '') package = '0';
        if (epicKey === '') epicKey = '0';

        return package + ';' + ticket + ';' + hours + ';' + task + ';' + epicKey;
    },

    _hideEditBox: function() {
        this.$editbox = null;
        $(document).click();
    },

    _deleteEntry: function(e) {
        if (confirm('Delete entry?')) {
            $(e.currentTarget).closest('.editbox__field').remove();
            this._updateText();
        }

        return false;
    },

    _copyOrCutEntry: function(e) {
        var $te = $(e.currentTarget).parent();
        var cutEntry = $(e.currentTarget).hasClass('cut');

        this.dataStorage = {
            ticket: $te.find('input.ticket').val(),
            package: $te.find('input.package').val(),
            hours: $te.find('input.hours').val(),
            task: $te.find('input.task').val(),
            epicKey: $te.find('input.epicKey').val()
        };

        if (cutEntry) {
            $te.closest('.editbox__field').remove();
            this._updateText();
        } else {
            $(e.currentTarget).text('Copied!');

            setTimeout(function() {
                $(e.currentTarget).text('Copy');
            }, 1500);
        }

        this._hideEditBox();
        e.preventDefault();

        return false;
    },

    _pasteEntry: function(e) {
        var $notes = this.$editbox.find('#notes-to-add');
        var ds = this.dataStorage;

        if (!ds) {
            return;
        }

        var t = this._createLine(ds.ticket, ds.package, ds.hours, ds.task, ds.epicKey) + this.options.lineSplitter;

        $notes.val($notes.val() + t);

        this.dataStorage = null;
        this._extendInputFields();

        return false;
    },

    _filterInput: function(type, val) {
        if (type.match(/hours/)) {
            return val.replace(/[^0-9.\,]/g, '');
        }

        return val.replace(/[;|]/g, '');
    },

    _inputChange: function(e) {
        var $this = $(e.currentTarget);
        var val = $this.val();
        var filteredVal = this._filterInput($this.attr('class'), val);

        if (val != filteredVal) {
            $this.val(filteredVal);
        }

        if ($this.hasClass('task')) {
            var ticketMatch = filteredVal.match(/^([A-Za-z]+-\d+)\s+(.*)$/);
            var $ticket = $this.closest('.task-extension').find('input.ticket');

            if (ticketMatch && $ticket.val() === '') {
                $ticket.val(ticketMatch[1]);
                $this.val(ticketMatch[2]);
            }
        }

        if (e && e.which == 13) {
            if ($this.next('input').length) {
                $this.next().focus();
            } else {
                this._updateText();
                this._extendInputFields();
            }
        } else if (e && e.which == 27) {
            this._hideEditBox();
        }

        this._updateText();
    },

    _inputClick: function(e) {
        var val = $(e.currentTarget).val();
        var m = val.match(/([A-Z]*-\d*)/i);
    },

    _convertTime: function(n) {
        return (typeof n == "string") ? Globalize.parseFloat(n) : n;
    },

    _formatTime: function(n) {
        if (!Globalize) return n.replace(/\./, ',');

        if (typeof n == "string") {
            n = Globalize.parseFloat(n);
        }

        return Globalize.format(n, 'n2');
    },

    _updateText: function() {
        var t = '';
        var hoursSum = 0;
        var self = this;

        if (!this.$editbox.length) {
            console.log('no editbox found!');
            return;
        }

        this.$editbox.find('.task-extension').each(function() {
            var $t = $(this);
            var ticket = self._filterInput('ticket', $t.find('input.ticket').val());
            var package = self._filterInput('text', $t.find('input.package').val());
            var hours = self._filterInput('hours', $t.find('input.hours').val());
            var task = self._filterInput('text', $t.find('input.task').val());
            var epicKey = self._filterInput('epicKey', $t.find('input.epicKey').val());

            if (hours) {
                hoursSum += self._convertTime(hours);
            }

            if (hours !== '' && task !== '') {
                t += self._createLine(ticket, package, hours, task, epicKey) + self.options.lineSplitter;
            }
        });

        this.$editbox.find('#notes-to-add').val($.trim(t));
        this.$editbox.find('#hours-to-add').val(hoursSum > 0 ? self._formatTime(hoursSum) : '');
        this.$editbox.find('#office-to-add').val(this.$editbox.find('#office-to-add').val() != '' ? this.$editbox.find('#office-to-add').val() : 2);

        setTimeout(function() {
            self._fillDayTimes();
        }, 200);
    },

    _initDayStartTimes: function() {
        $('input[id^="dayStartTime"]').each(function() {
            var $input = $(this);
            var isHoliday = $input.data('holiday') === true || $input.data('holiday') === 'true';

            if (isHoliday || $input.val()) {
                return;
            }

            $input.val(GecoConfig.getDayStartTime());
            $input.trigger('change');
            $input.trigger('focusout');
        });
    },

    _observeSummaryHours: function() {
        var self = this;
        var $summaryCells = $('.table--summary .table__cell[data-day]');

        if (this.summaryObserver) {
            this.summaryObserver.disconnect();
            this.summaryObserver = null;
        }

        if (!$summaryCells.length || typeof MutationObserver === 'undefined') {
            return;
        }

        this.summaryObserver = new MutationObserver(function(mutations) {
            $.each(mutations, function(i, mutation) {
                var $cell = $(mutation.target).closest('.table--summary .table__cell[data-day]');

                if (!$cell.length) {
                    return;
                }

                var day = parseInt($cell.data('day'), 10);

                if (!day) {
                    return;
                }

                self._updateDayEndTimeFromSummary(day);
            });
        });

        $summaryCells.each(function() {
            self.summaryObserver.observe(this, {
                childList: true,
                characterData: true,
                subtree: true
            });
        });

        $summaryCells.each(function() {
            var day = parseInt($(this).data('day'), 10);

            if (day) {
                self._updateDayEndTimeFromSummary(day);
            }
        });
    },

    _getSummaryHoursForDay: function(day) {
        var $summaryCell = $('.table--summary .table__cell[data-day="' + day + '"]');

        if (!$summaryCell.length) {
            return 0;
        }

        var text = $.trim($summaryCell.text());

        if (!text) {
            return 0;
        }

        text = text.replace(/[^\d,.]/g, '');

        if (!text) {
            return 0;
        }

        if (typeof Globalize !== 'undefined' && Globalize.parseFloat) {
            return Globalize.parseFloat(text);
        }

        return parseFloat(text.replace(',', '.'));
    },

    _updateDayEndTimeFromSummary: function(day) {
        function timeToMinutes(time) {
            var parts = time.split(':');
            return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        }

        function toHHMM(totalMinutes) {
            var h = Math.floor(totalMinutes / 60);
            var m = totalMinutes % 60;

            return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
        }

        var $startInput = $('#dayStartTime' + day);
        var $endInput = $('#dayEndTime' + day);

        if (!$startInput.length || !$endInput.length) {
            return;
        }

        var isHoliday = $startInput.data('holiday') === true || $startInput.data('holiday') === 'true';

        if (isHoliday) {
            return;
        }

        var totalHours = this._getSummaryHoursForDay(day);

        if (!totalHours || isNaN(totalHours) || totalHours <= 0) {
            return;
        }

        var startTime = $startInput.val();

        if (!startTime) {
            startTime = GecoConfig.getDayStartTime();

            $startInput.val(startTime);
            $startInput.trigger('change');
            $startInput.trigger('focusout');
        }

        if (!this._isValidTime(startTime)) {
            return;
        }

        var dayStart = timeToMinutes(startTime);
        var breakMinutes = GecoConfig.getBreakMinutesForHours(totalHours);
        var endMin = dayStart + Math.round(totalHours * 60) + breakMinutes;
        var newEnd = GecoConfig.isFixedEndTimeEnabled() ? GecoConfig.getDayEndTime() : toHHMM(endMin);

        if ($endInput.val() !== newEnd) {
            $endInput.val(newEnd);
            $endInput.trigger('change');
            $endInput.trigger('focusout');
        }
    },

    _fillDayTimes: function() {
        var self = this;

        $('.table--summary .table__cell[data-day]').each(function() {
            var day = parseInt($(this).data('day'), 10);

            if (day) {
                self._updateDayEndTimeFromSummary(day);
            }
        });
    }
};

// ---------------------------------------------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------------------------------------------
(function() {
    function waitForJQuery() {
        if (typeof jQuery === 'undefined') {
            window.setTimeout(waitForJQuery, 100);
        } else {
            jQuery(function() {
                GecoExtension.run();
            });
        }
    }

    waitForJQuery();
})();