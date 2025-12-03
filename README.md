# GECO Toolbox

Eine Sammlung von Tampermonkey-Skripten zur Erweiterung und Verbesserung der GECO-Webanwendung.

## Installation

### Voraussetzungen

1. Installiere die Tampermonkey Browser-Erweiterung:
    - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
    - [Firefox](https://addons.mozilla.org/de/firefox/addon/tampermonkey/)
    - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
    - [Safari](https://apps.apple.com/app/tampermonkey/id1482490089)

### Skript installieren
Klicke auf einen der folgenden Links, um das Skript direkt zu installieren:

- [GECO-T Booking Modal](https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco.user.js)
- [Planning Forecast Deltas](https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.planning-forecast-deltas.user.js)
- [Team Sort](https://github.com/vanilla-reply/geco-toolbox/raw/refs/heads/main/geco-o.team-sort.user.js)

## Skripte

### GECO-T Booking Modal

**Datei:** `geco.user.js`

Erweitert das Zeiterfassungs-Interface von GECO-T mit folgenden Features:

- **Strukturierte Eingabefelder:** Separate Felder für Ticket, Stunden, Arbeitspaket und Aufgabenbeschreibung
- **Copy/Cut/Paste:** Einträge können kopiert, ausgeschnitten und eingefügt werden
- **Aktueller Tag:** Der heutige Tag wird farblich hervorgehoben
- **Status-Farben:** Visuelle Unterscheidung der Buchungsstatus
- **Auto-Fill:** Schnellbefehle wie `db` für "Daily Business"

Das Skript kann über eine Checkbox aktiviert/deaktiviert werden, die in der GECO-Oberfläche erscheint.

---

### GECO-O Planning Forecast Deltas

**Datei:** `geco-o.planning-forecast-deltas.user.js`

Zeigt Änderungen (Deltas) in Forecast-Werten an:

- **Delta-Anzeige:** Zeigt die Differenz zum ursprünglichen Wert neben jedem Forecast-Feld
- **Farbcodierung:** Positive Änderungen in Grün, negative in Rot
- **Summen-Deltas:** Gesamtänderung pro Monat in der Fußzeile
- **Live-Updates:** Deltas werden bei jeder Eingabe sofort aktualisiert

---

### GECO-O Team Sort

**Datei:** `geco-o.team-sort.user.js`

Sortiert Teammitglieder im Tab "Team" alphabetisch nach Nachnamen, wenn man das Team speichert.

- **Manueller Button:** "Sort by Alphabet" Button zum manuellen Sortieren
- **Automatische Sortierung:** Sortiert automatisch vor dem Speichern des Formulars
- **Nachnamensbasiert:** Sortierung erfolgt nach dem ersten Wort des Namens

---

## Updates

Die Skripte unterstützen automatische Updates über Tampermonkey. Sobald eine neue Version verfügbar ist, wird Tampermonkey dich benachrichtigen.

Um manuell nach Updates zu suchen:
1. Klicke auf das Tampermonkey-Icon
2. Wähle **"Dashboard"**
3. Klicke auf das Update-Icon neben dem gewünschten Skript

## Autoren

| | Name | Email                 |
|:---:|:---|:----------------------|
| <img src="https://www.gravatar.com/avatar/7d8f828641a19e95ec4c3d1395359566?s=60&d=identicon" width="60" height="60" style="border-radius:50%"> | **Davide Orlandelli** | d.orlandelli@reply.de |
| <img src="https://www.gravatar.com/avatar/54bd9c96ab31da206ad5b64a7c43519b?s=60&d=identicon" width="60" height="60" style="border-radius:50%"> | **Frank Röttgers** | f.roettgers@reply.de  |
| <img src="https://www.gravatar.com/avatar/66b857db2904ecb0a35e6d839a89556d?s=60&d=identicon" width="60" height="60" style="border-radius:50%"> | **Roman Allenstein** | r.allenstein@reply.de |

*Weitere Mitwirkende: sku, fsf, dkr, pna, fro*

## Lizenz

Interne Verwendung bei REPLY.