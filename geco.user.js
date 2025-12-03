// ==UserScript==
// @name         Geco 3.23 (2025)
// @namespace    https://geco.reply.com/
// @version      3.23
// @description  Tweaks for our precious Geco
// @author       sku, fsf, dkr, pna, fro, dor, r.allenstein@reply.de
// @match        https://geco.reply.com/*
// @match        https://geco.reply.eu/*
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco.user.js
// @grant        none
// @noframes
// ==/UserScript==
// == Changelog ========================================================================================================
// 0.1      Initial release
/*jshint multistr:true */
// ---------------------------------------------------------------------------------------------------------------
// main geco extension
// ---------------------------------------------------------------------------------------------------------------
var debug;
var params = {};
var start = window.location.href.indexOf("?");
var parts = window.location.href.substring(start + 1 ).split('&');
for (var i = 0; i < parts.length; i++) {
    var nv = parts[i].split('=');
    if (!nv[0]) continue;
    params[nv[0]] = nv[1] || true;
}
if(params.debugBeauty === "true"){
    debug = true
}
debug && console.log("debugging mode on Beautifier.");
var GecoExtension = {
    // ---------------------------------------------------------------------------------------------------------------
    // options
    // ---------------------------------------------------------------------------------------------------------------
    options: {
        version: 3.23,
        //oldLineExpr: /#([0-9A-Za-zßÖöÜüÄä-]*) \(([0-9,]*) ?h?\) (.*)/,
        oldLineExpr: /^([^;]*)?;([^;]*)?;([0-9,.]*);(.*)$/,
        //oldLineSplitter: ';',
        oldLineSplitter: '|',
        lineExpr: /^([^;]*)?;([^;]*)?;([0-9,.]*);([^;]*);(.+)$/,
        lineSplitter: '|',
        autofiller: {
            'db': ['', '', 1, 'Daily Business', '']
        }
    },
    dataStorage: null,
    intervalId: null,
    // ---------------------------------------------------------------------------------------------------------------
    // run extension with delay
    // ---------------------------------------------------------------------------------------------------------------
    run: function() {
        var iv,
            self = this;
        // check in interval if extension is installed
        iv = setInterval(function() {
            if ($('.page__content').length) {
                self._init();
            }
        }, 500);
    },
    // ---------------------------------------------------------------------------------------------------------------
    // init all markup and events
    // ---------------------------------------------------------------------------------------------------------------
    _init: function() {
        // do we have the checkbox?
        if ($('#geco-extension').length) return;
        this._addExtensionEnableCheckbox();
        this._applyStyles();
        // run extension if we have enabled cookie
        if (parseInt(this._getCookie('geco-extension'))) {
            this._enableExtension();
        }
    },
    // ---------------------------------------------------------------------------------------------------------------
    // cookie: set cookie
    // ---------------------------------------------------------------------------------------------------------------
    _setCookie: function(cname, cvalue, exdays) {
        var d = new Date();
        d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
        var expires = "expires=" + d.toUTCString();
        document.cookie = cname + "=" + cvalue + "; " + expires;
    },
    // ---------------------------------------------------------------------------------------------------------------
    // cookie: get cookie
    // ---------------------------------------------------------------------------------------------------------------
    _getCookie: function(cname) {
        var name = cname + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ') c = c.substring(1);
            if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
        }
        return "";
    },
    // ---------------------------------------------------------------------------------------------------------------
    // apply new styles
    // ---------------------------------------------------------------------------------------------------------------
    _applyStyles: function() {
        var styles = '<style type="text/css" id="geco-fe-styles"> \
            .geco-fe-enabled .editbox { width: 360px !important; max-width: 360px !important; padding-bottom: 0; } \
            .geco-fe-enabled .editbox p { width: 65px; } \
            .geco-fe-enabled .editbox input[type="text"], .geco-fe-enabled .editbox textarea { width: 280px !important; } \
            .geco-fe-enabled .editbox input[type="text"][disabled], .geco-fe-enabled .editbox textarea[disabled] { color: #999 !important; } \
            .geco-fe-enabled .editbox input.readonly { border-color: white; box-shadow: none; padding: 2px 0 0; height: 20px; margin-left: -10px; } \
            .geco-fe-enabled .editbox .selectbox { width: 289px !important; margin-left: -1px; } \
            \
            .geco-fe-enabled .table__cell[data-status="1"] { background-color: #54C9EA !important; border-width: 0; color: white; } \
            .geco-fe-enabled .table__cell[data-status="2"] { background-color: #79c143 !important; border-width: 0; color: white; } \
            .geco-fe-enabled .table__cell[data-status="3"] { background-color: #F06EAA !important; border-width: 0; color: white; } \
            .geco-fe-enabled .table__cell[data-status="1"] > div, .table__cell[data-status="2"] > div, .table__cell[data-status="3"] > div { color: white; } \
            .geco-fe-enabled .table__cell > div input, .geco-fe-enabled .table__cell > div textarea { color: black; } \
            \
            .geco-fe-enabled .task-extension { overflow: hidden; position: relative; text-align: left; padding: 5px 10px 0px 77px; margin: -5px -10px -10px -10px; } \
            .geco-fe-enabled .task-extension.current { background-color: rgba(121,193,67,0.6) !important; } \
            .geco-fe-enabled .task-extension a.icon { position: absolute; width: 40px; height: 12px; left: 10px; background-repeat: no-repeat; background-position: left center; background-size: 12px 12px; opacity: 0.5; color: #000; font-size: 9px; padding-left: 16px; text-indent: 50px; overflow: hidden; } \
            .geco-fe-enabled .task-extension a.icon:hover { opacity: 1; text-indent: 0; text-decoration: none; } \
            .geco-fe-enabled .task-extension a.icon.copy { top: 11px; background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPiAgICA8cGF0aCBkPSJNMTYgMUg0Yy0xLjEgMC0yIC45LTIgMnYxNGgyVjNoMTJWMXptMyA0SDhjLTEuMSAwLTIgLjktMiAydjE0YzAgMS4xLjkgMiAyIDJoMTFjMS4xIDAgMi0uOSAyLTJWN2MwLTEuMS0uOS0yLTItMnptMCAxNkg4VjdoMTF2MTR6Ii8+PC9zdmc+); } \
            .geco-fe-enabled .task-extension a.icon.cut { top: 28px; background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPiAgICA8Y2lyY2xlIGN4PSI2IiBjeT0iMTgiIGZpbGw9Im5vbmUiIHI9IjIiLz4gICAgPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgZmlsbD0ibm9uZSIgcj0iLjUiLz4gICAgPGNpcmNsZSBjeD0iNiIgY3k9IjYiIGZpbGw9Im5vbmUiIHI9IjIiLz4gICAgPHBhdGggZD0iTTkuNjQgNy42NGMuMjMtLjUuMzYtMS4wNS4zNi0xLjY0IDAtMi4yMS0xLjc5LTQtNC00UzIgMy43OSAyIDZzMS43OSA0IDQgNGMuNTkgMCAxLjE0LS4xMyAxLjY0LS4zNkwxMCAxMmwtMi4zNiAyLjM2QzcuMTQgMTQuMTMgNi41OSAxNCA2IDE0Yy0yLjIxIDAtNCAxLjc5LTQgNHMxLjc5IDQgNCA0IDQtMS43OSA0LTRjMC0uNTktLjEzLTEuMTQtLjM2LTEuNjRMMTIgMTRsNyA3aDN2LTFMOS42NCA3LjY0ek02IDhjLTEuMSAwLTItLjg5LTItMnMuOS0yIDItMiAyIC44OSAyIDItLjkgMi0yIDJ6bTAgMTJjLTEuMSAwLTItLjg5LTItMnMuOS0yIDItMiAyIC44OSAyIDItLjkgMi0yIDJ6bTYtNy41Yy0uMjggMC0uNS0uMjItLjUtLjVzLjIyLS41LjUtLjUuNS4yMi41LjUtLjIyLjUtLjUuNXpNMTkgM2wtNiA2IDIgMiA3LTdWM3oiLz48L3N2Zz4=); } \
            .geco-fe-enabled .task-extension a.icon.delete { top: 45px; background-size: 16px; left: 8px; background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTE5IDYuNDFMMTcuNTkgNSAxMiAxMC41OSA2LjQxIDUgNSA2LjQxIDEwLjU5IDEyIDUgMTcuNTkgNi40MSAxOSAxMiAxMy40MSAxNy41OSAxOSAxOSAxNy41OSAxMy40MSAxMnoiLz4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==); } \
            .geco-fe-enabled .task-extension a.icon.paste { top: 11px; background-image: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiBoZWlnaHQ9IjI0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4gICAgPHBhdGggZD0iTTE5IDJoLTQuMThDMTQuNC44NCAxMy4zIDAgMTIgMGMtMS4zIDAtMi40Ljg0LTIuODIgMkg1Yy0xLjEgMC0yIC45LTIgMnYxNmMwIDEuMS45IDIgMiAyaDE0YzEuMSAwIDItLjkgMi0yVjRjMC0xLjEtLjktMi0yLTJ6bS03IDBjLjU1IDAgMSAuNDUgMSAxcy0uNDUgMS0xIDEtMS0uNDUtMS0xIC40NS0xIDEtMXptNyAxOEg1VjRoMnYzaDEwVjRoMnYxNnoiLz4gICAgPHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==); } \
            \
            .geco-fe-enabled .editbox .editbox__field:nth-child(even) .task-extension { background-color: rgba(121,193,67,0.1);  } \
            .geco-fe-enabled .editbox .editbox__field:nth-child(odd) .task-extension { background-color: rgba(121,193,67,0.2);  } \
            \
            .geco-fe-enabled .task-extension input.inputbox.ticket { width: 70px !important; margin-right: 3px; margin-bottom: 5px; } \
            .geco-fe-enabled .task-extension input.inputbox.package { width: 150px !important; margin-bottom: 5px; } \
            .geco-fe-enabled .task-extension input.inputbox.hours { width: 30px !important; margin-right: 3px; margin-right: 3px; margin-bottom: 5px; } \
            .geco-fe-enabled .task-extension input.inputbox.task { width: 280px !important; margin-right: 3px; margin-bottom: 5px; } \
            .geco-fe-enabled .task-extension input.inputbox.epicKey { background-color: #efefef; width: 60px !important; margin-right: 3px; margin-bottom: 5px; display: none } \
            \
            .geco-fe-enabled .table--hours .activity__lev1 .table__cell, .geco-fe-enabled .table--activity .activity__lev1 { background-color: rgba(0,0,0,.1); } \
            .geco-fe-enabled .table--hours .activity__lev2 .table__cell, .geco-fe-enabled .table--activity .activity__lev2 { background-color: rgba(0,0,0,.05); } \
            .geco-fe-enabled .table--hours .table__cell--summary + .table__cell::after { content: ""; width: 2px; background-color: #bababa; height: 100%; display: block; top: 0; position: absolute; margin-left: -1px;} \
            \
            .geco-fe-enabled .table__cell.current-day { background-color: rgb(241,78,79); } \
            .geco-fe-enabled .table--hours .table__cell.current-day { background-color: rgba(241,78,79,0.2); } \
            .geco-fe-enabled .table--hours .activity__lev1 .table__cell.current-day { background-color: #e5c4c6; } \
            .geco-fe-enabled .table--hours .activity__lev2 .table__cell.current-day { background-color: #f2cfd1; } \
            .geco-fe-enabled .table__cell.current-day b, .geco-fe-enabled .table__cell.current-day i { color: #FFF !important; } \
            \
            .geco-fe-enabled #notes-to-add.inactive { background-color: #efefef; height: 24px; } \
            .geco-fe-enabled #notes-to-add.inactive:focus { height: 50px; } \
            \
            .geco-fe-enabled .button-action.btn-month-conf-save { float: left; margin-top: 10px; margin-left: 10px; } \
            .geco-fe-enabled select.geco-fe-confirm-filter { float: right; } \
            \
            .geco-fe-checkbox-container input#geco-extension { float: left; } \
            .geco-fe-checkbox-container label[for="geco-extension"] { display: inline-block; padding-left: 3px; } \
            .geco-fe-checkbox-container { position: absolute; font-size: 11px; } \
            .geco-fe-checkbox-container label { line-height: 0; } \
            .geco-fe-checkbox-container strong.geco { color: #a2a2a2; } \
            .geco-fe-checkbox-container strong.geco span { color: #79c143; } \
        </style>';
        if ($('#geco-fe-styles').length) return;
        $('head').append(styles);
    },
    // ---------------------------------------------------------------------------------------------------------------
    // checkbox to enable/disable geco input extension
    // ---------------------------------------------------------------------------------------------------------------
    _addExtensionEnableCheckbox: function() {
        var self = this;
        // get cookie value
        var cVal = parseInt(this._getCookie('geco-extension'));
        // add checkbox to active/deactivate extension
        var $chkbox = $('<input type="checkbox" value="1" id="geco-extension" />');
        if (cVal) $chkbox.prop('checked', true);
        // set event for change
        $chkbox.on('change.geco', function() {
            var isChecked = $(this).is(':checked');
            // start interval detection and store value
            isChecked ? self._enableExtension() : self._disableExtension();
            // set cookie to store user value
            self._setCookie('geco-extension', isChecked ? 1 : 0, 30);
        });
        $chkbox.insertBefore('.page__content .tables-wrap .timesheet-action');
        $chkbox.wrap('<div class="geco-fe-checkbox-container"></div>');
        $chkbox.after('<label for="geco-extension">Enable <strong class="geco">ge<span>co</span></strong> frontend extension (v' + this.options.version + ')</label>');
    },
    // ---------------------------------------------------------------------------------------------------------------
    // add new button "confirm selected" to confirm month only
    // ---------------------------------------------------------------------------------------------------------------
    // _addConfirmSelectedButton: function() {
    //   var $daybtn = $( '<button class="button-action btn-days-conf-save" disabled><span>Confirm selected only</span></button>' );
    //   $daybtn.on( 'click.geco', function() {
    //     if ( $( '#modal-month-conf input[type="checkbox"]:checked' ).length ) {
    //       $( '#tab-timereporting-month input.btn-month-conf-save-selected' ).trigger( 'click' );
    //       $daybtn.prop( 'disabled', true );
    //     }
    //   } );
    //   // insert button and set functionality
    //   $( '#modal-month-conf .modal-footer .btn-month-conf-save' ).before( $daybtn );
    //   $( '#modal-month-conf' ).on( 'change.geco', 'input[type="checkbox"]', function() {
    //     $daybtn.prop( 'disabled', !$( '#modal-month-conf input[type="checkbox"]:checked' ).length );
    //   } );
    // },
    // ---------------------------------------------------------------------------------------------------------------
    // append select box for filtering confirm table
    // ---------------------------------------------------------------------------------------------------------------
    // _addConfirmTableFilter: function() {
    //   var $select = $( '<select size="1" class="geco-fe-confirm-filter"></select>' );
    //   $select.append( '<option value="">Show all</option>' );
    //   $select.append( '<option>Open</option>' );
    //   $select.append( '<option>Confirmed</option>' );
    //   $select.append( '<option>Approved</option>' );
    //   $select.on( 'change.geco', $.proxy( this._filterConfirmTable, this ) );
    //   $( '#modal-month-conf .nav.nav-tabs' ).append( $select );
    //   // reset filter on button click
    //   $( '#btn-month-conf' ).on( 'click.geco', function() {
    //     $select.val( '' );
    //   } );
    // },
    // ---------------------------------------------------------------------------------------------------------------
    // filter elements
    // ---------------------------------------------------------------------------------------------------------------
    // _filterConfirmTable: function( e ) {
    //   var filter = $( e.target ).val();
    //   // show all when no filter is selected
    //   if ( filter == '' ) {
    //     $( '#tab-timereporting-month tbody tr' ).show();
    //     return;
    //   }
    //   $( '#tab-timereporting-month tbody tr td:nth-child(2) img' ).each( function() {
    //     var $this = $( this );
    //     $this.attr( 'title' ) == filter ? $this.closest( 'tr' ).show() : $this.closest( 'tr' ).hide();
    //   } );
    // },
    // ---------------------------------------------------------------------------------------------------------------
    // function: enable extension
    // ---------------------------------------------------------------------------------------------------------------
    _enableExtension: function() {
        // add additional markup
        //this._addConfirmSelectedButton();
        //this._addConfirmTableFilter();
        this._highlightCurrentDay();
        // add class for body
        $('body').addClass('geco-fe-enabled');
        var self = this;
        // remove tab key functionality
        $(document).off('keydown');
        // start interval for checking opened edit box
        this.intervalId = setInterval(function() {
            var $editbox = $('.table--hours .table__cell.openend-cell .editbox:not(.geco-fe-extended)');
            if ($editbox.length && !$editbox.hasClass('geco-fe-extended')) {
                self.$editbox = $editbox;
                self.$editbox.addClass('geco-fe-extended');
                self._extendInputFields();
            }
        }, 200);
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: disable extension
    // ---------------------------------------------------------------------------------------------------------------
    _disableExtension: function() {
        // clear elements inserted
        clearInterval(this.intervalId);
        // remove inserted elements
        $('.editbox .task-extension').parent().remove();
        $('button.button-action.btn-days-conf-save').remove();
        $('select.geco-fe-confirm-filter').remove();
        // remove events
        $('#modal-month-conf').off('change.geco');
        // remove class for body
        $('body').removeClass('geco-fe-enabled');
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: highlight current day
    // ---------------------------------------------------------------------------------------------------------------
    _highlightCurrentDay: function() {
        var d = new Date(),
            //firstDayOfMonth = ( d.getYear() + 1900 ) + '-' + ( d.getMonth() + 1 ) + '-1',
            monthStr = d.toLocaleString(navigator.language || 'en', { "month": "long" }) + ' ' + (d.getYear() + 1900);
        idx = 0;
        // check if we are on current month
        if ($('#ts-navigation input').val() !== monthStr) {
            return;
        }
        // detect which colum contains current day
        $('.table--days .table__cell').each(function(i) {
            var day = $(this).find('b').text();
            if (day == d.getDate()) idx = i;
        });
        // add classes for highlight the columns
        idx += 1;
        $('.table--days .table__cell:nth-child(' + idx + ')').addClass('current-day');
        $('.table--hours .table__row .table__cell:nth-child(' + idx + ')').addClass('current-day');
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: add new input fields and hide unused elements
    // ---------------------------------------------------------------------------------------------------------------
    _extendInputFields: function(noFieldFocus) {
        var $ta = this.$editbox.find('#notes-to-add'),
            $hours = this.$editbox.find('#hours-to-add'),
            text = $.trim($ta.val()),
            lines = text.split(this.options.lineSplitter),
            isDisabled = ($ta.prop('disabled')),
            r, ticket, package, hours, task, epicKey,
            self = this;
        // convert old format to new one
        if (text.length > 0 && text.match(this.options.oldLineExpr)) {
            lines = text.split(this.options.oldLineSplitter);
            var wasModified = false;
            for (var l = 0; l < (lines.length - 1); l++) {
                if (lines[l].match(this.options.lineExpr)) {
                    continue;
                }
                r = lines[l].match(this.options.oldLineExpr);
                console.log(r);
                ticket = (r && r[2] != '0') ? r[2] : '';
                package = (r && r[1] != '0') ? r[1] : '';
                hours = r ? r[3] : '';
                task = r ? r[4] : '';
                epicKey = '';
                lines[l] = this._createLine(ticket, package, hours, task, epicKey);
                wasModified = true;
            }
            if (wasModified) {
                console.log('textbefore', text);
                console.log('textafter', lines.join(this.options.lineSplitter));
                text = lines.join(this.options.lineSplitter);
                $ta.val(text);
                this.$editbox.parent().first().addClass('modified');
                if (this.$editbox.parent().find('i.marker').length === 0) {
                    this.$editbox.parent().first().append($('<i class="marker"></i>'));
                }
                $('.alert.alert--modified').show();
            }
        }
        // don't show box when:
        // input field is disabled, hour box is a dropdown
        if ($hours.prop('tagName') == 'SELECT' || (text.length > 0 && !text.match(this.options.lineExpr))) {
            return;
        }
        // add events to links
        this.$editbox.on('click.geco', 'a.icon.delete', $.proxy(this._deleteEntry, this));
        this.$editbox.on('click.geco', 'a.icon.cut, a.icon.copy', $.proxy(this._copyOrCutEntry, this));
        this.$editbox.on('click.geco', 'a.icon.paste', $.proxy(this._pasteEntry, this));
        // hide office box from display
        // this.$editbox.find('#office-to-add').closest('.editbox__field').hide();
        // add read only state for hour field
        this.$editbox.find('#hours-to-add').addClass('readonly').attr('readonly', 'readonly');
        // add inactive class for visual
        $ta.addClass('inactive');
        // remove existing input boxes
        this.$editbox.find('.task-extension').remove();
        // add new boxes for each existing entry
        for (var l = 0; l < lines.length; l++) {
            // line is filled, add current text
            if (lines[l] !== '') {
                r = lines[l].match(this.options.lineExpr);
                ticket = (r && r[2] != '0') ? r[2] : '';
                package = (r && r[1] != '0') ? r[1] : '';
                hours = r ? r[3] : '';
                task = r ? r[4] : '';
                epicKey = r ? (r[5] && r[5] != '0' ? r[5] : '') : '';
            }
            // empty line for input
            else {
                hours = task = ticket = package = epicKey = '';
                if (isDisabled) continue;
            }
            // append all input fields
            var $te = $('<div class="task-extension"></div>');
            $te.append('<input type="text" name="epicKey" class="inputbox epicKey inactive" value="' + epicKey + '" placeholder="Epic-Key" readonly="readonly" />');
            $te.append('<input type="text" name="ticket" class="inputbox ticket" value="' + ticket + '" placeholder="Ticket" />');
            $te.append('<input type="text" name="hours" class="inputbox hours" value="' + hours + '" placeholder="h" />');
            $te.append('<input type="text" name="package" class="inputbox package" value="' + package + '" placeholder="Work package (optional)" />');
            $te.append('<input type="text" name="task" class="inputbox task" value="' + task + '" placeholder="Task description" />');
            // add delete and cut links for current entry
            if (l < lines.length - 1) {
                $te.append('<a href="javascript:;" class="icon copy" title="Copy current entry" tabindex="-1">Copy</a>');
                $te.append('<a href="javascript:;" class="icon cut" title="Cut current entry" tabindex="-1">Cut</a>');
                $te.append('<a href="javascript:;" class="icon delete" title="Delete current entry" tabindex="-1">Delete</a>');
            } else if (this.dataStorage) {
                $te.append('<a href="javascript:;" class="icon paste" title="Paste entry">Paste</a>');
            }
            if (l == lines.length - 1) {
                $te.find('input.package').on('blur.geco', $.proxy(this._autofill, this));
                $te.addClass('current');
            }
            $te.insertAfter(this.$editbox.find('.editbox__field').last());
            $te.wrap('<div class="editbox__field"></div>');
            if (isDisabled) $te.find('input[type="text"]').prop('disabled', true);
        }
        // update position if it's not shown completely
        /*var h = this.$editbox.outerHeight(),
         o = this.$editbox.offset(),
         wh = $( window ).height() - 58 // 58 = header height;
         if ( o.top + h > wh ) {
         var io = $( '#noFixedCol .tbody .selected-cell' ).last().offset();
         this.$editbox.removeClass( 'bottom' ).addClass( 'top' ).css( 'top', io.top - h );
         }*/
        // focus last input box and set events to input fields
        setTimeout(function() {
            self.$editbox.find('.editbox__field:last .task-extension input.ticket').focus();
        }, 300);
        // set event for key input
        $(document).on('keyup.geco blur.geco', '.task-extension input', $.proxy(this._inputChange, this));
        $(document).on('click.geco', '.task-extension input', $.proxy(this._inputClick, this));
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: auto fill defined by keywords entered in package field
    // ---------------------------------------------------------------------------------------------------------------
    _autofill: function(e) {
        var $fld = $(e.currentTarget),
            $parent = $fld.parent(),
            v = $fld.val(),
            aValues;
        // do we have any autofill enabled=
        if (!this.options.autofiller || !this.options.autofiller[v]) {
            return;
        }
        aValues = this.options.autofiller[v];
        $parent.find('input.package').val(aValues[0]);
        $parent.find('input.ticket').val(aValues[1]);
        $parent.find('input.hours').val(aValues[2]);
        $parent.find('input.task').val(aValues[3]);
        $parent.find('input.epicKey').val(aValues[4]);
        this._updateText();
        this._extendInputFields();
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: create line for notes field
    // ---------------------------------------------------------------------------------------------------------------
    _createLine: function(ticket, package, hours, task, epicKey) {
        if (ticket === '') ticket = '0';
        if (package === '') package = '0';
        if (epicKey === '') epicKey = '0';
        return package + ';' + ticket + ';' + hours + ';' + task + ';' + epicKey;
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: hide edit by clicking anywhere outside
    // ---------------------------------------------------------------------------------------------------------------
    _hideEditBox: function() {
        this.$editbox = null;
        $(document).click();
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: delete entry by clicking icon
    // ---------------------------------------------------------------------------------------------------------------
    _deleteEntry: function(e) {
        if (confirm('Delete entry?')) {
            $(e.currentTarget).closest('.editbox__field').remove();
            this._updateText();
        }
        return false;
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: copy/cut entry by clicking icon
    // ---------------------------------------------------------------------------------------------------------------
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
        }
        else {
            $(e.currentTarget).text('Copied!');
            setTimeout(function() { $(e.currentTarget).text('Copy'); }, 1500);
        }
        this._hideEditBox();
        e.preventDefault();
        return false;
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: paste entry by clicking icon
    // ---------------------------------------------------------------------------------------------------------------
    _pasteEntry: function(e) {
        var $te = $(e.currentTarget).parent(),
            $notes = this.$editbox.find('#notes-to-add'),
            ds = this.dataStorage,
            t;
        if (!ds) {
            return;
        }
        t = this._createLine(ds.ticket, ds.package, ds.hours, ds.task, ds.epicKey) + this.options.lineSplitter;
        $notes.val($notes.val() + t);
        this.dataStorage = null;
        this._extendInputFields();
        return false;
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: limit input of user in ticket field
    // ---------------------------------------------------------------------------------------------------------------
    _filterInput: function(type, val) {
        if (type.match(/hours/)) {
            return val.replace(/[^0-9.\,]/g, '');
        } else {
            return val.replace(/[;|]/g, '');
        }
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: update text in task field when user entered anyhting
    // ---------------------------------------------------------------------------------------------------------------
    _inputChange: function(e) {
        var $this = $(e.currentTarget),
            val = $this.val();
        // update text value
        var filteredVal = this._filterInput($this.attr('class'), val);
        if (val != filteredVal) $this.val(filteredVal);
        // handle keypress "return" on input field, focus next field or get new line when on last field
        if (e && e.which == 13) {
            if ($this.next('input').length) {
                $this.next().focus();
            } else {
                this._updateText();
                this._extendInputFields();
            }
        }
        // key: ESC - hide popover
        else if (e && e.which == 27) {
            this._hideEditBox();
        }
        this._updateText();
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: update text in task field when user entered anyhting
    // ---------------------------------------------------------------------------------------------------------------
    _inputClick: function(e) {
        var val = $(e.currentTarget).val(),
            m = val.match(/([A-Z]*-\d*)/i);
       // if (!e.shiftKey || !m) return;
       // window.open('https://youtrack.portaltech.cloud/issue/' + m[1]);
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: convert time to float for summarize
    // ---------------------------------------------------------------------------------------------------------------
    _convertTime: function(n) {
        return (typeof n == "string") ? Globalize.parseFloat(n) : n;
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: format time for proper output
    // ---------------------------------------------------------------------------------------------------------------
    _formatTime: function(n) {
        if (!Globalize) return n.replace(/\./, ',');
        if (typeof n == "string") n = Globalize.parseFloat(n);
        return Globalize.format(n, 'n2');
    },
    // ---------------------------------------------------------------------------------------------------------------
    // function: update note field with given text
    // ---------------------------------------------------------------------------------------------------------------
    _updateText: function() {
        var t = '',
            hoursSum = 0,
            self = this;
        if (!this.$editbox.length) {
            console.log('no editbox found!');
            return;
        }
        // concat string
        this.$editbox.find('.task-extension').each(function() {
            var $t = $(this);
            var ticket = self._filterInput('ticket', $t.find('input.ticket').val());
            var package = self._filterInput('text', $t.find('input.package').val());
            var hours = self._filterInput('hours', $t.find('input.hours').val());
            var task = self._filterInput('text', $t.find('input.task').val());
            var epicKey = self._filterInput('epicKey', $t.find('input.epicKey').val());
            // summarize total hours
            if (hours) {
                hoursSum += self._convertTime(hours);
            }
            if (hours !== '' && task !== '') {
                t += self._createLine(ticket, package, hours, task, epicKey) + self.options.lineSplitter;
            }
        });
        // update total hours and task
        // don't concat if nothing is filled
        this.$editbox.find('#notes-to-add').val($.trim(t));
        this.$editbox.find('#hours-to-add').val(hoursSum > 0 ? self._formatTime(hoursSum) : '');
        this.$editbox.find('#office-to-add').val( this.$editbox.find('#office-to-add').val() != '' ? this.$editbox.find('#office-to-add').val() : 2);
    }
};
//GecoExtension.run();
(function() {
    function waitForJQuery() {
        if (typeof jQuery === 'undefined')
            window.setTimeout(waitForJQuery, 100);
        else
            jQuery(function() {
                GecoExtension.run();
            });
    }
    waitForJQuery();
})();
