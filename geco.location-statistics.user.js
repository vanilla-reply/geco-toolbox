// ==UserScript==
// @name         Geco-T Location Statistics
// @namespace    https://geco.reply.com/
// @version      1.0
// @description  Shows monthly location shares based on GECO timesheet responses
// @author       o.poglitsch@reply.de
// @match        https://geco.reply.com/*
// @match        https://geco.reply.eu/*
// @grant        none
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    var GecoLocationStatistics = {
        excludedProjectIds: [7],
        latestTimesheet: null,
        latestStatisticsSignature: '',
        initialized: false,
        xhrObserved: false,
        fetchObserved: false,

        run: function() {
            this._applyStyles();
            this._observeXhr();
            this._observeFetch();
            this._waitForPage();
        },

        _waitForPage: function() {
            var self = this;

            if ($('.footer__left').length) {
                self._init();
                return;
            }

            window.setTimeout(function() {
                self._waitForPage();
            }, 300);
        },

        _init: function() {
            if (this.initialized && $('#geco-location-statistics').length) {
                return;
            }

            this.initialized = true;

            if ($('#geco-location-statistics').length) {
                return;
            }

            var $box = $('' +
                '<div id="geco-location-statistics">' +
                '<div class="geco-location-statistics__content">' +
                'Waiting for timesheet data ...' +
                '</div>' +
                '</div>'
            );

            var $footerLeft = $('.footer__left').first();

            if ($footerLeft.length) {
                $footerLeft.append($box);
            } else {
                $('body').append($box);
            }
        },

        _applyStyles: function() {
            if ($('#geco-location-statistics-styles').length) return;

            var styles = '<style type="text/css" id="geco-location-statistics-styles"> \
                .footer__left { position: relative; } \
                #geco-location-statistics { position: absolute; left: 185px; top: 14px; font-size: 12px; color: #747474; z-index: 20; box-sizing: border-box; min-width: 250px; } \
                #geco-location-statistics .geco-location-statistics__legend { display: flex; flex-wrap: wrap; gap: 5px 10px; height: 19px; } \
                #geco-location-statistics .geco-location-statistics__legend-item { display: inline-flex; align-items: center; gap: 5px; } \
                #geco-location-statistics .geco-location-statistics__legend-color { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; } \
                #geco-location-statistics .geco-location-statistics__legend-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } \
                #geco-location-statistics .geco-location-statistics__progress-row { display: flex; align-items: center; gap: 5px; line-height: 10px; } \
                #geco-location-statistics .geco-location-statistics__progress { display: flex; flex: 1 1 auto; width: 100%; height: 15px; overflow: visible; margin-top: -5px;} \
                #geco-location-statistics .geco-location-statistics__progress-counter { flex: 0 0 auto; font-weight: bold; font-size: 11px; white-space: nowrap; } \
                #geco-location-statistics .geco-location-statistics__progress-segment { height: 10px; min-width: 2px; position: relative; margin-top: 5px; } \
                #geco-location-statistics .geco-location-statistics__progress-segment b { font-weight: normal; color: #747474; font-size: 10px; text-align: center; text-indent: 0; background: #ffffff; box-shadow: 0 0 3px #e7e7e7; min-width: max-content; max-width: 160px; position: absolute; left: 50%; bottom: 15px; transform: translateX(-50%); padding: 5px; border: 1px solid #e7e7e7; display: none; line-height: 13px; white-space: normal; z-index: 100; } \
                #geco-location-statistics .geco-location-statistics__progress-segment:hover { margin-top: 0; padding-top: 5px; } \
                #geco-location-statistics .geco-location-statistics__progress-segment:hover b { display: block; } \
                #geco-location-statistics .geco-location-statistics__progress-segment b:after { display: block; content: ""; width: 0; height: 0; position: absolute; left: 50%; bottom: -7px; margin-left: -4px; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 7px solid #ffffff; } \
                #geco-location-statistics .geco-location-statistics__empty { color: #777; font-size: 11px; line-height: 14px; } \
            </style>';

            $('head').append(styles);
        },

        _observeXhr: function() {
            var self = this;

            if (this.xhrObserved || typeof XMLHttpRequest === 'undefined') {
                return;
            }

            this.xhrObserved = true;

            var originalOpen = XMLHttpRequest.prototype.open;
            var originalSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function(method, url) {
                this._gecoLocationStatisticsUrl = url;
                return originalOpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function(body) {
                var xhr = this;

                xhr.addEventListener('load', function() {
                    self._handleResponse(xhr.responseText, xhr._gecoLocationStatisticsUrl);
                });

                return originalSend.apply(this, arguments);
            };
        },

        _observeFetch: function() {
            var self = this;

            if (this.fetchObserved || typeof window.fetch === 'undefined') {
                return;
            }

            this.fetchObserved = true;

            var originalFetch = window.fetch;

            window.fetch = function() {
                var fetchArguments = arguments;

                return originalFetch.apply(this, fetchArguments).then(function(response) {
                    var clonedResponse = response.clone();

                    clonedResponse.text().then(function(text) {
                        self._handleResponse(text);
                    });

                    return response;
                });
            };
        },

        _handleResponse: function(responseText, url) {
            var response;
            var timesheet;

            if (!responseText || responseText.charAt(0) !== '{') {
                return;
            }

            try {
                response = JSON.parse(responseText);
            } catch (e) {
                return;
            }

            timesheet = this._extractTimesheet(response);

            if (!timesheet) {
                return;
            }

            this.latestTimesheet = timesheet;
            this._renderFromTimesheet(timesheet);
        },

        _extractTimesheet: function(response) {
            if (response && response.d && response.d.Timesheet) {
                return response.d.Timesheet;
            }

            if (response && response.Timesheet) {
                return response.Timesheet;
            }

            return null;
        },

        _renderFromTimesheet: function(timesheet) {
            var statistics = this._calculateStatistics(timesheet);
            var signature = JSON.stringify(statistics);

            this._init();

            if (signature === this.latestStatisticsSignature) {
                return;
            }

            this.latestStatisticsSignature = signature;

            $('#geco-location-statistics .geco-location-statistics__content').html(this._renderStatistics(statistics));
        },

        _calculateStatistics: function(timesheet) {
            var legalEntityWorkingHours = parseFloat(timesheet.LegalEntityWorkingHours);
            var workingDays = this._getWorkingDays(timesheet);
            var excludedHoursByDate = {};
            var officeHoursByDate = {};
            var effectiveWorkingDays = {};
            var result = {
                monthName: timesheet.MonthName || timesheet.Month || '',
                legalEntityWorkingHours: isNaN(legalEntityWorkingHours) || legalEntityWorkingHours <= 0 ? 8 : legalEntityWorkingHours,
                workingDaysTotal: 0,
                workingDaysEffective: 0,
                excludedDays: 0,
                locations: {}
            };

            result.workingDaysTotal = workingDays.length;

            for (var w = 0; w < workingDays.length; w++) {
                effectiveWorkingDays[String(workingDays[w])] = true;
            }

            this._walkTimeReportings(timesheet, function(context) {
                var reporting = context.reporting;
                var project = context.project;
                var date = reporting.Date;
                var hours = parseFloat(reporting.Hours);

                if (!date || isNaN(hours) || hours <= 0) {
                    return;
                }

                if (GecoLocationStatistics._isExcludedProject(project)) {
                    if (!excludedHoursByDate[date]) {
                        excludedHoursByDate[date] = 0;
                    }

                    excludedHoursByDate[date] += hours;
                    return;
                }

                if (!officeHoursByDate[date]) {
                    officeHoursByDate[date] = {};
                }

                var officeKey = GecoLocationStatistics._getOfficeKey(reporting);
                var officeName = GecoLocationStatistics._getOfficeName(reporting);

                if (!officeHoursByDate[date][officeKey]) {
                    officeHoursByDate[date][officeKey] = {
                        officeId: reporting.OfficeId,
                        officeName: officeName,
                        hours: 0
                    };
                }

                officeHoursByDate[date][officeKey].hours += hours;
            });

            $.each(excludedHoursByDate, function(date, hours) {
                var day = GecoLocationStatistics._getDayFromDate(date);

                if (!day || !effectiveWorkingDays[String(day)]) {
                    return;
                }

                if (hours >= result.legalEntityWorkingHours) {
                    delete effectiveWorkingDays[String(day)];
                    result.excludedDays++;
                }
            });

            result.workingDaysEffective = this._countObjectKeys(effectiveWorkingDays);

            $.each(officeHoursByDate, function(date, offices) {
                var day = GecoLocationStatistics._getDayFromDate(date);

                if (!day || !effectiveWorkingDays[String(day)]) {
                    return;
                }

                $.each(offices, function(officeKey, officeData) {
                    var dayFraction = officeData.hours / result.legalEntityWorkingHours;

                    if (dayFraction > 1) {
                        dayFraction = 1;
                    }

                    if (!result.locations[officeKey]) {
                        result.locations[officeKey] = {
                            officeId: officeData.officeId,
                            officeName: officeData.officeName,
                            hours: 0,
                            days: 0
                        };
                    }

                    result.locations[officeKey].hours += officeData.hours;
                    result.locations[officeKey].days += dayFraction;
                });
            });

            this._addUnassignedDays(result);

            return result;
        },

        _addUnassignedDays: function(result) {
            var assignedDays = 0;
            var unassignedDays;

            $.each(result.locations, function(locationKey, locationData) {
                assignedDays += locationData.days;
            });

            unassignedDays = result.workingDaysEffective - assignedDays;

            if (unassignedDays <= 0) {
                return;
            }

            result.locations.unassigned = {
                officeId: null,
                officeName: 'Not assigned',
                hours: unassignedDays * result.legalEntityWorkingHours,
                days: unassignedDays
            };
        },

        _getWorkingDays: function(timesheet) {
            var days = [];

            if (!timesheet.UserWorkingDays || !$.isArray(timesheet.UserWorkingDays)) {
                return days;
            }

            $.each(timesheet.UserWorkingDays, function(i, workingDay) {
                var day = parseInt(workingDay.Day, 10);

                if (!day || workingDay.IsHoliday === true) {
                    return;
                }

                days.push(day);
            });

            return days;
        },

        _walkTimeReportings: function(timesheet, callback) {
            var customers = timesheet.Customers || [];

            $.each(customers, function(customerIndex, customer) {
                var projects = customer.Projects || [];

                $.each(projects, function(projectIndex, project) {
                    var projectSubs = project.ProjectSubs || [];

                    $.each(projectSubs, function(projectSubIndex, projectSub) {
                        var tasks = projectSub.Tasks || [];

                        $.each(tasks, function(taskIndex, task) {
                            var reportings = task.TimeReportings || [];

                            $.each(reportings, function(reportingIndex, reporting) {
                                callback({
                                    customer: customer,
                                    project: project,
                                    projectSub: projectSub,
                                    task: task,
                                    reporting: reporting
                                });
                            });
                        });
                    });
                });
            });
        },

        _isExcludedProject: function(project) {
            var projectId = project && typeof project.Id !== 'undefined' ? parseInt(project.Id, 10) : NaN;

            if (isNaN(projectId)) {
                return false;
            }

            return $.inArray(projectId, this.excludedProjectIds) !== -1;
        },

        _getOfficeKey: function(reporting) {
            if (reporting.OfficeId !== null && typeof reporting.OfficeId !== 'undefined') {
                return String(reporting.OfficeId);
            }

            if (reporting.OfficeShortCode) {
                return String(reporting.OfficeShortCode);
            }

            return 'unknown';
        },

        _getOfficeName: function(reporting) {
            if (reporting.OfficeShortCode) {
                return String(reporting.OfficeShortCode);
            }

            if (reporting.OfficeId !== null && typeof reporting.OfficeId !== 'undefined') {
                return 'Office ' + reporting.OfficeId;
            }

            if (reporting.InReplyOffice === "0") {
                return 'In person with Final Customer';
            }

            if(reporting.InReplyOffice === "1") {
                return 'Reply Office';
            }

            return 'Unknown office';
        },

        _getDayFromDate: function(date) {
            var parts = String(date || '').split('-');

            if (parts.length < 3) {
                return 0;
            }

            return parseInt(parts[2], 10);
        },

        _countObjectKeys: function(object) {
            var count = 0;

            $.each(object, function() {
                count++;
            });

            return count;
        },

        _formatNumber: function(value, decimals) {
            var factor = Math.pow(10, decimals);
            var rounded = Math.round(value * factor) / factor;

            return String(rounded.toFixed(decimals)).replace('.', ',');
        },

        _escapeHtml: function(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        },

        _renderStatistics: function(statistics) {
            var self = this;
            var locationKeys = [];
            var html = '';
            var legendHtml = '';
            var denominatorDays = statistics.workingDaysEffective;
            var assignedDays = 0;
            var assignedDaysLabel;
            var denominatorDaysLabel;
            var colors = [
                '#00a6a6',
                '#ff6b6b',
                '#f5a623',
                '#79c143',
                '#F06EAA',
                '#54C9EA',
                '#c77dff',
            ];

            $.each(statistics.locations, function(locationKey, locationData) {
                locationKeys.push(locationKey);

                if (locationKey !== 'unassigned') {
                    assignedDays += locationData.days;
                }
            });

            locationKeys.sort(function(a, b) {
                if (a === 'unassigned') {
                    return 1;
                }

                if (b === 'unassigned') {
                    return -1;
                }

                return statistics.locations[b].days - statistics.locations[a].days;
            });

            if (!locationKeys.length || denominatorDays <= 0) {
                return '<div class="geco-location-statistics__empty">No office time reportings found.</div>';
            }

            assignedDaysLabel = self._formatNumber(assignedDays, assignedDays % 1 === 0 ? 0 : 1);
            denominatorDaysLabel = self._formatNumber(denominatorDays, denominatorDays % 1 === 0 ? 0 : 1);

            $.each(locationKeys, function(i, locationKey) {
                var location = statistics.locations[locationKey];
                var percent = location.days / denominatorDays * 100;
                var widthPercent;
                var color;
                var tooltipText;
                var ptLabel;
                var percentLabel;

                if (percent > 100) {
                    percent = 100;
                }

                percentLabel = self._formatNumber(percent, 1) + '%';
                widthPercent = self._formatNumber(percent, 2).replace(',', '.');
                color = locationKey === 'unassigned' ? '#eee' : colors[i % colors.length];
                ptLabel = self._formatNumber(location.days, location.days % 1 === 0 ? 0 : 1) + ' Days';
                tooltipText = location.officeName + ': ' + percentLabel + ' · ' + ptLabel;

                if (locationKey !== 'unassigned') {
                    legendHtml += '' +
                        '<span class="geco-location-statistics__legend-item">' +
                        '<span class="geco-location-statistics__legend-color" style="background: ' + color + ';"></span>' +
                        '<span class="geco-location-statistics__legend-name">' +
                        self._escapeHtml(location.officeName + ' (' + percentLabel + ')') +
                        '</span>' +
                        '</span>';
                }

                html += '' +
                    '<div class="geco-location-statistics__progress-segment" ' +
                    'style="width: ' + widthPercent + '%; background: ' + color + ';">' +
                    '<b>' + self._escapeHtml(tooltipText) + '</b>' +
                    '</div>';
            });

            return '' +
                '<div class="geco-location-statistics__legend">' +
                legendHtml +
                '</div>' +
                '<div class="geco-location-statistics__progress-row">' +
                '<div class="geco-location-statistics__progress">' +
                html +
                '</div>' +
                '<span class="geco-location-statistics__progress-counter" title="Assigned workdays / total workdays">' +
                assignedDaysLabel + '/' + denominatorDaysLabel + ' Days' +
                '</span>' +
                '</div>';
        }
    };

    function waitForJQuery() {
        if (typeof jQuery === 'undefined') {
            window.setTimeout(waitForJQuery, 100);
            return;
        }

        jQuery(function() {
            GecoLocationStatistics.run();
        });
    }

    waitForJQuery();
})();