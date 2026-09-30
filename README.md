# Fiesta Verkäufer – Chrome Extension

Erstellt das Ford-Fiesta-Inserat anhand von `autoscout24-form-filled.html` auf
AutoScout24.de: Fahrzeugdaten, Kontakt, Preis/Zustand, neun Bilder, Ausstattung
und Beschreibung. Abschließend wird **Veröffentlichen** angeklickt.

## Installation

1. In Chrome `chrome://extensions` öffnen.
2. **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden** wählen und diesen Projektordner auswählen
   (dort liegt `manifest.json`).
4. Die Extension bei Bedarf über das Puzzleteil-Symbol an die Toolbar anheften.

Zur Verwendung ist kein Build und kein `npm install` erforderlich. Die
HTML-Vorlage und der Ordner `Bilder/` müssen im Extension-Ordner bleiben.

## Verwendung

1. `https://www.autoscout24.de` öffnen und im eigenen Konto anmelden.
2. Das Auto-Icon anklicken.
3. **Auf AutoScout24 inserieren** anklicken. Dieser Button erscheint nur auf
   AutoScout24.de. Der Ablauf startet auf der Verkaufsstartseite im aktiven Tab.
4. Fortschritt im Popup verfolgen; das Popup darf geschlossen werden.
5. Bei einer Unterbrechung die angegebene Stelle auf der Seite bearbeiten und
   **Fortsetzen** wählen. **Stoppen** unterbricht weitere automatische Aktionen.

Die Vorlage enthält 15.200 €, 32.500 km und die Kontaktnummer 01715432107. Alle
Fahrzeug- und Ausstattungswerte einschließlich der formatierten Beschreibung
werden direkt aus dieser Vorlage gelesen. Die Bilder stammen aus `Bilder/`;
`Mängel.jpg` wird zuletzt übergeben. Scheitert der Upload vollständig, wird ohne
Bilder fortgefahren; ein Teil-Upload wird zur manuellen Prüfung unterbrochen.

Die Extension klickt am Ende automatisch auf **Veröffentlichen**. Ob das Inserat
tatsächlich veröffentlicht wurde, wird nur bei einer erkannten Erfolgsbestätigung
als bestätigt angezeigt; andernfalls zeigt das Popup „Veröffentlichung angefordert“.
Der letzte Klick wird nach einem Reload nicht automatisch wiederholt.

## Dokumentation und Entwicklung

Die vollständige Ablauf-, Daten- und Selektorspezifikation steht in
[`spec-autoscout24.md`](spec-autoscout24.md), einschließlich Vorlage für einen
Playwright-Test und der Besonderheiten der gelieferten Snapshots.

```sh
npm install
npm run check
npm test
```

Die Tests verwenden die lokalen DOM-Snapshots und simulierte Website-Reaktionen.
Ein vollständiger Live-Test auf AutoScout24 wurde noch nicht durchgeführt.
Insbesondere die geöffneten Datumsdialoge sind in den Snapshots nicht enthalten;
bei einem unbekannten Dialogaufbau meldet die Extension das manuell einzustellende
Datum und kann danach fortgesetzt werden.

Icons lassen sich mit `python tools/generate_icons.py` neu erzeugen.
Weitere Verkaufsplattformen können über zusätzliche DOM-Adapter ergänzt werden.
