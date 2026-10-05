# Fiesta Verkäufer – AutoScout24 und Kleinanzeigen

Erstellt das Ford-Fiesta-Inserat anhand gemeinsamer Fahrzeugdaten auf
**AutoScout24.de** und **Kleinanzeigen.de**: Fahrzeugdaten, Kontakt, 14.500 €,
neun Bilder, Ausstattung und Beschreibung. Auf AutoScout24 werden abschließend
**Veröffentlichen** und **Kostenlos weiter** angeklickt; auf Kleinanzeigen wird
das **Basis Paket** gewählt und **Anzeige aufgeben** angeklickt.

## Installation

1. In Chrome `chrome://extensions` öffnen.
2. **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden** wählen und diesen Projektordner auswählen
   (dort liegt `manifest.json`).
4. Die Extension bei Bedarf über das Puzzleteil-Symbol an die Toolbar anheften.

Zur Verwendung ist kein Build und kein `npm install` erforderlich. Die
HTML-Vorlage und der Ordner `Bilder/` müssen im Extension-Ordner bleiben.

## Verwendung

1. AutoScout24.de oder Kleinanzeigen.de öffnen und im eigenen Konto anmelden.
2. Das Auto-Icon anklicken.
3. **Auf AutoScout24 inserieren** beziehungsweise **Auf Kleinanzeigen inserieren**
   anklicken. Der Button passt zum aktiven Anbieter. Auf anderen Seiten bietet
   das Popup Buttons zum Öffnen beider Anbieter.
4. Fortschritt im Popup verfolgen; das Popup darf geschlossen werden.
5. Bei einer Unterbrechung die angegebene Stelle auf der Seite bearbeiten und
   **Fortsetzen** wählen. **Stoppen** unterbricht weitere automatische Aktionen.

Der aktuelle Inseratpreis beträgt **14.500 €** und ist in `profile.js` hinterlegt.
Die Vorlage enthält 32.500 km und die Kontaktnummer 01715432107. Die übrigen
Fahrzeug- und Ausstattungswerte einschließlich der formatierten Beschreibung
werden direkt aus dieser Vorlage gelesen. Kleinanzeigen erhält die Beschreibung
als Klartext mit Absätzen und Listen; die Mängelangaben bleiben vollständig.
Die Kleinanzeigen-Beschreibung enthält ausschließlich den Vorlagentext, ohne
zusätzliche Kontakt- oder Schadstoffklassenzeilen. Der Name stammt aus dem angemeldeten
Kleinanzeigen-Profil. Die Bilder stammen aus `Bilder/`;
`Mängel.jpg` wird zuletzt übergeben. Scheitert der Upload vollständig, wird ohne
Bilder fortgefahren; ein Teil-Upload wird zur manuellen Prüfung unterbrochen.
Vor dem Seitenwechsel wartet die Extension, bis alle neun Bildkarten ohne
Lade-Overlay, Spinner und „Lädt“-Anzeige fertig sind. Dies gilt auch beim
Fortsetzen eines bereits begonnenen Uploads.

Bei AutoScout24 klickt die Extension am Ende automatisch auf **Veröffentlichen** und danach
auf der Paket-Auswahl auf **Kostenlos weiter**. Ob das Inserat
tatsächlich veröffentlicht wurde, wird nur bei einer erkannten Erfolgsbestätigung
als bestätigt angezeigt; andernfalls zeigt das Popup **Ergebnis prüfen** mit
dem Hinweis auf „Meine Inserate“. Beide Klicks haben eigene Checkpoints und
werden nach einem Reload nicht automatisch wiederholt. Der noch offene kostenlose
Abschluss kann nach „Veröffentlichen“ fortgesetzt werden.

Bei Kleinanzeigen startet der Ablauf auf
`https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html`. Er lädt Bilder
hoch, setzt den Titel **Ford Fiesta Vignale 1,0 l EcoBoost Automatik - Top Ausstattung**, wählt
**Auto, Rad & Boot › Autos › Ford › Fiesta**, füllt die Felder aus und geht über
**Nächster Schritt** zur Paket-Auswahl. Dort wird ausschließlich das kostenlose
**Basis Paket** ausgewählt und **Anzeige aufgeben** angeklickt. Der Upload gilt
erst bei neun bestätigten Server-Bilddatensätzen ohne Ladeanzeige als fertig.
Ein laufender Upload wird nicht doppelt gestartet. Fehlt eine notwendige Angabe
oder verlangt die Website Anmeldung/Telefonverifizierung, wird die konkrete
Stelle gemeldet und der Ablauf kann danach fortgesetzt werden.

Es läuft jeweils ein Inseratablauf; er bleibt an seinen Anbieter und Tab gebunden.
Ein finaler Kleinanzeigen-Veröffentlichungsklick wird nach Reload nicht wiederholt.

## Dokumentation und Entwicklung

### Gesponserte Angebote und LeasingMarkt.de ausblenden

Im Popup gibt es die standardmäßig aktivierte Einstellung **Gesponserte Inhalte
und LeasingMarkt.de ausblenden**. Sie blendet gesponserte Angebotskarten und mit
dem LeasingMarkt.de-Logo gekennzeichnete Angebote auf AutoScout24.de aus, auch
wenn diese nachgeladen werden. Contentbanner-Container samt reserviertem Freiraum
und leere Umfrage-Platzhalter werden ebenfalls ausgeblendet.
Die Einstellung bleibt gespeichert und gilt für
alle AutoScout24-Tabs. Beim Ausschalten werden die Angebote sofort wieder sichtbar.

Die vollständige Ablauf-, Daten- und Selektorspezifikation steht in
[`spec-autoscout24.md`](spec-autoscout24.md) und
[`spec-kleinanzeigen.md`](spec-kleinanzeigen.md), einschließlich Vorlagen für
Playwright-Tests und der Besonderheiten der gelieferten Snapshots.
Bei Änderungen an der Extension werden die betroffenen Spezifikationen im selben Arbeitsschritt
aktualisiert; die Projektregel dazu ist in `AGENTS.md` festgehalten.

```sh
npm install
npm run check
npm test
```

Die Tests verwenden die lokalen DOM-Snapshots und simulierte Website-Reaktionen.
Der Nutzer hat den erfolgreichen AutoScout24-Ablauf bestätigt. Eigene automatisierte
Live-Browsertests stehen weiterhin aus; die Kleinanzeigen-Korrekturen werden offline geprüft.
Insbesondere die geöffneten Datumsdialoge sind in den Snapshots nicht enthalten;
bei einem unbekannten Dialogaufbau meldet die Extension das manuell einzustellende
Datum und kann danach fortgesetzt werden.

Icons lassen sich mit `python tools/generate_icons.py` neu erzeugen.
Weitere Verkaufsplattformen können über zusätzliche DOM-Adapter ergänzt werden.
