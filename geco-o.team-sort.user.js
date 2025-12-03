// ==UserScript==
// @name         Team - Sort by Alphabet
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adjusts the numbering of table rows by the first word of the last name before saving the form
// @author       Roman Allenstein <r.allenstein@reply.de>
// @match        https://geco.reply.com/GeCoO/Project/ManageTeam.aspx?*
// @match        https://geco.reply.eu/GeCoO/Project/ManageTeam.aspx?*
// @grant        none
// @downloadURL  https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team-sort.user.js
// @updateURL    https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team-sort.user.js
// @run-at       document-end
// @noframes
// ==/UserScript==
// == Changelog ========================================================================================================
// 1.0      Initial release

(function() {
    'use strict';

    function addCustomOptions() {
        if (!document.getElementById('tampermonkey-custom-options')) {
            const h2Element = document.querySelector('h2');
            if (!h2Element) return;

            const div = document.createElement('div');
            div.id = 'tampermonkey-custom-options';
            div.style.marginTop = '10px';
            div.style.marginBottom = '10px';
            div.style.display = 'flex';
            div.style.gap = '10px'; // Abstand zwischen den Buttons

            h2Element.insertAdjacentElement('afterend', div);
        }
    }

    // Optional: Manueller Sortier-Button (kannst du auch rauswerfen, wenn nicht mehr gebraucht)
    function addSortButton() {
        const customOptionsDiv = document.getElementById('tampermonkey-custom-options');
        if (customOptionsDiv) {
            const sortButton = document.createElement('button');
            sortButton.innerText = 'Sort by Alphabet';
            sortButton.type = 'button'; // Verhindert das Absenden des Formulars
            sortButton.addEventListener('click', (event) => {
                event.preventDefault(); // Seite wird nicht neu geladen
                adjustSortingByAlphabet();
            });

            customOptionsDiv.appendChild(sortButton);
        }
    }

    // Funktion zum Anpassen der Nummerierung nach Alphabet
    function adjustSortingByAlphabet() {
        const rows = Array.from(document.querySelectorAll('.table__row')).slice(1); // Überschrift auslassen

        const sortedRows = rows.slice().sort((a, b) => {
            const nameASpan = a.querySelector('span[id^="rptUsers_"][id$="_ltUserName"]');
            const nameBSpan = b.querySelector('span[id^="rptUsers_"][id$="_ltUserName"]');

            if (!nameASpan || !nameBSpan) return 0;

            const nameA = nameASpan.innerText.split(' ')[0].toUpperCase();
            const nameB = nameBSpan.innerText.split(' ')[0].toUpperCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });

        sortedRows.forEach((row, index) => {
            const sortingInput = row.querySelector('input[id^="rptUsers_"][id$="_txtSorting"]');
            if (sortingInput) {
                sortingInput.value = index + 1; // Sortierung aktualisieren
            }
        });
    }

    // 1) Vor dem Formular-Submit automatisch sortieren
    function hookFormSubmit() {
        // Wenn es mehrere Forms gibt, kannst du den Selektor hier eingrenzen
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            form.addEventListener('submit', function() {
                adjustSortingByAlphabet();
            }, true); // capture = true -> wird sehr früh im Event-Flow ausgeführt
        });
    }

    // 2) CheckTeamForm('save') hooken und davor sortieren
    function hookCheckTeamForm() {
        if (typeof window.CheckTeamForm !== 'function') {
            return;
        }

        // Doppeltes Wrappen vermeiden
        if (window.CheckTeamForm.__tmWrapped) {
            return;
        }

        const originalCheckTeamForm = window.CheckTeamForm;

        function wrappedCheckTeamForm() {
            // Argumente abgreifen (z.B. 'save')
            const args = Array.prototype.slice.call(arguments);
            const action = args[0];

            // Nur bei 'save' eingreifen
            if (action === 'save') {
                adjustSortingByAlphabet();
            }

            // Originalfunktion aufrufen
            return originalCheckTeamForm.apply(this, args);
        }

        wrappedCheckTeamForm.__tmWrapped = true;
        window.CheckTeamForm = wrappedCheckTeamForm;
    }

    // Da CheckTeamForm evtl. erst später definiert wird, pollen wir kurz
    function waitForCheckTeamForm() {
        const intervalId = setInterval(() => {
            if (typeof window.CheckTeamForm === 'function') {
                hookCheckTeamForm();
                clearInterval(intervalId);
            }
        }, 300);

        // Sicherheitsabschaltung nach ein paar Sekunden
        setTimeout(() => clearInterval(intervalId), 10000);
    }

    // Warte, bis die Seite vollständig geladen ist, bevor das Skript ausgeführt wird
    window.addEventListener('load', () => {
        addCustomOptions();
        addSortButton();   // optional
        hookFormSubmit();  // Vor jedem Submit sortieren
        waitForCheckTeamForm(); // CheckTeamForm('save') hooken
    });
})();