# Spezifikation: Fiesta-Verkäufer für AutoScout24

## 1. Ziel und Bedienung

Chrome-Extension (Manifest V3), die das vorgegebene Ford-Fiesta-Inserat auf
AutoScout24.de erstellt. Ein Klick auf **Auf AutoScout24 inserieren** startet
Schritt 0 im aktiven Tab. Anschließend werden Fahrzeug, Kontakt, Preis/Zustand,
Bilder und Details ausgefüllt und **Veröffentlichen** angeklickt.

Das Popup zeigt Fahrzeugübersicht, Status, aktuellen Schritt, Fortschrittsbalken,
**Stoppen** und bei einer Unterbrechung **Fortsetzen**. Der Startbutton erscheint
nur bei `https://www.autoscout24.de/*` beziehungsweise `https://autoscout24.de/*`.
Das Popup darf während des Ablaufs geschlossen werden.

Voraussetzungen: lokal geladene Extension einschließlich der Vorlage und aller
Bilder, AutoScout24-Konto und erforderlichenfalls Anmeldung im Inserat-Tab.
Login, CAPTCHA und unbekannte Dialoge werden auf der Website bedient. Wenn ein
benötigtes Feld nicht erreichbar ist, meldet die Extension den konkreten
Selektor beziehungsweise die Auswahl und kann danach fortgesetzt werden.

## 2. Quellen und ihre Besonderheiten

| Quelle | Verwendung |
| --- | --- |
| `autoscout24.de_sell_car_form_page_0.html` | Verkaufsstartseite, Link `#market-place-link` |
| `autoscout24.de_sell_car_form_page_1.html` | Abhängige Fahrzeugauswahl (`psuf-vehicle-insertion-form-*`) |
| `autoscout24.de_sell_car_form_page_2.html` | Kontakt-Miniformular |
| `autoscout24.de_sell_car_form_page_3.html` | Preis/Zustand-Miniformular |
| `autoscout24.de_sell_car_form_page_4.html` | Bilder-Miniformular; dies ist die richtige Quelle für Schritt 4 |
| `autoscout24.de_sell_car_form_page_5.html.lnk` | Windows-Verknüpfung auf **page_4.html**, kein Detailsnapshot |
| `autoscout24-form-filled.html` | Verbindliche Datenquelle und DOM-Grundlage für das vollständige Detailformular |
| `Bilder/*.jpg` | Neun lokale Fahrzeugbilder |

Der Link im Snapshot von Schritt 0 enthält abweichende Beispieldaten (unter
anderem Diesel, Schaltgetriebe und 2025) und öffnet einen neuen Tab. Beim Start
wird sein `href` deshalb auf die vom Nutzer vorgegebene Einstiegs-URL und sein
`target` auf `_self` gesetzt, dann der Link angeklickt.

Auch der Preis 15.000 € in page_3 ist ein Beispielwert. Maßgeblich sind 15.200 €
aus der ausgefüllten Vorlage. Die Vorlage wird unverändert gelesen; auch deren
Modellvariante „Fiesta 1.0 EcoBoost S“, Beschreibung „Vignale“, Leistung
101 PS in den Formularfeldern beziehungsweise 100 PS im Beschreibungstext sowie
die Anzahl von 5 Gängen werden so übernommen, wie sie dort gespeichert sind.

## 3. Aufbau zum Nachbauen

| Datei | Aufgabe |
| --- | --- |
| `manifest.json` | MV3, Berechtigungen, Hosts, Popup, PNG-Icons und Content-Script-Reihenfolge |
| `background.js` | Ablauf starten/stoppen/fortsetzen, Tabbindung, persistente Statusänderungen, Vorlage bereitstellen |
| `popup.html`, `popup.css`, `popup.js` | Deutsche Bedienoberfläche und Statusanzeige |
| `profile.js` | HTML-Vorlage mit `DOMParser` inert parsen und Formularprofil erzeugen |
| `automation.js` | DOM-Erkennung, Felder, Comboboxen, Datumsdialoge, Bilder, Detailabschnitte und Veröffentlichung |
| `content.js` | Ablaufsteuerung auf der Website, Wiederaufnahme nach Navigation und SPA-Wechseln |
| `icons/car-{16,32,48,128}.png` | Chrome-kompatibles Auto-Icon mit Verkaufs-/Häkchenbadge |
| `tools/generate_icons.py` | Reproduzierbare PNG-Erzeugung ohne zusätzliche Python-Pakete |
| `tools/inspect_forms.py`, `tools/extract_profile.py` | Offline-Auswertung der Original-DOMs |
| `tests/extension.test.cjs` | Offline-Tests mit Node und jsdom |

Keine Build-Stufe und keine npm-Pakete zur Laufzeit erforderlich. Bei einer
Verteilung müssen `autoscout24-form-filled.html` und `Bilder/` mitgeliefert
werden. Die übrigen Snapshots werden zur Laufzeit nicht gebraucht.

### Manifest und Datenzugriff

- Berechtigungen: `storage`, `activeTab`.
- Hostzugriff nur auf die zwei oben genannten AutoScout24-Hosts per HTTPS.
- Content Scripts im isolierten Kontext: `profile.js`, `automation.js`,
  `content.js`, jeweils bei `document_idle`.
- Nur `Bilder/*.jpg` sind für diese Hosts `web_accessible_resources`.
- Der Worker liest die Vorlage über `fetch(chrome.runtime.getURL(...))` und
  liefert den HTML-Text an das Content Script. `DOMParser` führt darin enthaltene
  Scripts nicht aus. Die Vorlage muss nicht webzugänglich sein.
- Die Extension kommuniziert für den Inseratablauf über die Website-Oberfläche;
  es werden keine internen AutoScout24-APIs nachgebaut.

### Extraktionsregeln für das Fahrzeugprofil

Aus der Vorlage alle `input` und `button[role=combobox]` auslesen:

1. Versteckte Inputs, Datei-Inputs, Footer-Inputs `exb*` und Controls ohne ID
   beziehungsweise `aria-labelledby` auslassen.
2. Bei vorhandener ID `[id="..."]` als Selektor verwenden. Dies funktioniert
   auch bei IDs mit `/`, beispielsweise `unterhaltung/media-equipments-122`.
3. Ansonsten `[role="combobox"][aria-labelledby="..."]` verwenden. Zufällig
   generierte `aria-owns`-IDs dienen nur zum Auffinden der aktuell geöffneten
   Vorschlagsliste, niemals als fest codierte Selektoren.
4. Text-Inputs über `value`, Combobox-Buttons über ihren Text auslesen.
5. Alle Checkboxen mit explizitem booleschem Sollzustand erfassen; bei Radios
   nur das markierte Mitglied jeder Gruppe erfassen. Leere Textwerte auslassen.
6. Equipment über das ID-Fragment `-equipments-` erkennen.
7. Beschreibung als vollständiges `#description.innerHTML` übernehmen.
8. Erstzulassung aus `[data-testid="registrationDate-datePicker"] button`,
   nächste HU/AU aus dem zweiten DatePicker-Hauptbutton der Vorlage lesen.

Die HTML-Datei ist somit die einzige Datenquelle für Fahrzeug, Equipment und
Beschreibung; die Extension benötigt keine zweite manuell gepflegte Datenkopie.

## 4. Gemeinsame Interaktionsregeln

- Sichtbarkeit, deaktivierte Controls und den aktiven Ablauf vor Aktionen prüfen.
- Bei Inputs den nativen Setter von `HTMLInputElement.prototype.value` aufrufen,
  danach `input` und `change` mit `bubbles: true` auslösen. Das aktualisiert auch
  von React kontrollierte Formulare. Danach die tatsächliche Übernahme prüfen.
- Checkboxen und Radios nur anklicken, wenn der Sollzustand abweicht; bevorzugt
  das zugehörige `label[for]` anklicken. Keine blinden Toggles beim Fortsetzen.
- Combobox öffnen, bei Text-Comboboxen Suchtext eingeben, sichtbaren Vorschlag
  aus der zugehörigen Liste anklicken und den übernommenen Wert prüfen.
  Reines Eingeben eines Suchtexts ersetzt keine Auswahl.
- Abhängige Fahrzeugfelder nacheinander bedienen; erst nach Freischaltung des
  nächsten Controls fortfahren. Optionen werden exakt anhand normalisierter
  Texte oder ausdrücklich aufgeführter Aliase ausgewählt.
- Warteintervalle: 200 ms; normalerweise 20 s Timeout, bei Schrittwechseln 30 s,
  bei Bilder-Uploads 120 s. Statusprüfung erfolgt auch während des Wartens.
- `Weiter` anhand von `data-testid` oder der bekannten ID wählen, nicht anhand
  zufälliger CSS-Modulnamen. Unbekannte Seiten werden nach 30 s als Unterbrechung
  gemeldet. Mehrere Miniformulare haben dieselbe URL, daher per DOM unterscheiden.

## 5. Schritt 0 – Inserat erstellen

**URL:** `https://www.autoscout24.de/auto-verkaufen/`

1. Beim Start den bestehenden Tab auf diese URL navigieren.
2. Wenn sichtbar, Cookie-Dialog über
   `[data-testid="as24-cmp-decline-all-button"]` schließen.
3. `#market-place-link` suchen; alternativ sichtbaren Link/Button mit genau
   „Inserat erstellen“.
4. Bei einem Link das Ziel auf die URL von Schritt 1 und `_self` setzen.
5. Fortschritt auf Schritt 1 speichern, Link anklicken.

**Erwartung:** Fahrzeugauswahl oder das vollständige manuelle Detailformular.
Die Live-Seite kann einen anderen Weg als die gespeicherten Snapshots liefern;
das vollständige Formular wird ebenfalls unterstützt.

## 6. Schritt 1 – Fahrzeugauswahl

**Vorgegebene URL:**
`https://www.autoscout24.de/manual-listing-creation/private/vehicle-listing/?vehicleType=C&ref=mini-forms&event_source=navigation_bar_sell_cta`

**Erkennung:** `#psuf-vehicle-insertion-form-select-make`.

Alle IDs mit Präfix `psuf-vehicle-insertion-form-`, sofern anders angegeben:

| Reihenfolge | Suffix/Selektor | Auswahl |
| --- | --- | --- |
| 1 | `select-make` | Ford |
| 2 | `select-model` | Fiesta |
| 3 | `#first-registration-year-from-input` | 2020 |
| 4 | `first-registration-month-from-input` | Juni, alternativ 06 oder 6 |
| 5 | `select-body-type-and-doors` | Kleinwagen, 5 Türen; Aliase: „Kleinwagen (5 Türen)“, „Kleinwagen / 5 Türen“, „Kleinwagen, 4/5 Türen“ |
| 6 | `select-fuel-category` | Benzin |
| 7 | `select-transmission` | Automatik |
| 8 | `select-power` | 74 kW (101 PS); Aliase: „74 kW (100 PS)“, „74 kW / 101 PS“, „101 PS (74 kW)“, „100 PS (74 kW)“ |
| 9 | `select-model-version` | Fiesta 1.0 EcoBoost S; Katalog-Aliase: „Fiesta 1.0 EcoBoost“, „Vignale“ |
| 10 | `mileage` | 32.500 |
| 11 | `go-next-button-default` | Weiter anklicken, sobald aktiviert |

Falls die Variante im Fahrzeugkatalog nicht verfügbar ist, den offiziellen
`[data-testid="no-vehicle-fallback-link"]` verwenden. Dessen vorhandene
Fahrzeugparameter bleiben erhalten; `mileage=32500` und
`version=Fiesta 1.0 EcoBoost S` ergänzen und im selben Tab öffnen. Das komplette
Detailformular übernimmt anschließend alle verbindlichen Daten.

**Erwartung:** Kontakt-Miniformular oder vollständiges Detailformular.

## 7. Schritt 2 – Kontakt

**URL:** `https://www.autoscout24.de/manual-listing-creation/private/mini-forms/`

**Erkennung:** sichtbarer `steps-continue-button` und
`#contactFieldPhoneNumberFull`, ohne Preis- oder Bilder-Miniformular.

| Selektor | Wert |
| --- | --- |
| `[role=combobox][aria-labelledby="location"]` | 81925 München; passenden Ortsvorschlag auswählen |
| `[role=combobox][aria-labelledby="contactFieldCountryCode"]` | +49 |
| `#contactFieldPhoneNumberFull` | 01715432107 |
| `#hidePhoneNumber__false` | Markieren: Ja, Rufnummer als Kontaktmöglichkeit hinzufügen |
| `[data-testid="steps-continue-button"]` | Weiter |

**Erwartung:** Preis/Zustand wird sichtbar. Die gleiche Kontaktkonfiguration
gilt später für den Detailabschnitt Kontakt.

## 8. Schritt 3 – Preis und Zustand

**URL:** wie Schritt 2. **Erkennung:** sichtbarer `#price` und
`[data-testid="steps-continue-button"]`, ohne Bilder-Input.

| Selektor | Wert |
| --- | --- |
| `#price` | 15.200 |
| `#mileage` | 32.500 |
| `#priceNegotiable` | Nicht markiert |
| `#taxDeductible` | Nicht markiert |
| `[role=combobox][aria-labelledby="previousOwnersLabel"]` | 1 |
| `#fullServiceHistory` | Markiert |
| `#nonSmoking` | Markiert |
| `[data-testid="steps-continue-button"]` | Weiter |

**Erwartung:** Fahrzeugbilder-Miniformular.

## 9. Schritt 4 – Fahrzeugbilder

**URL:** wie Schritt 2. **Snapshot:** `page_4.html`.
**Erkennung:** `#image-upload` und sichtbarer `steps-continue-button`.

Dateien in dieser Reihenfolge, das Mängelbild bewusst zuletzt:

1. `Bilder/Ford Fiesta.jpg`
2. `Bilder/Front.jpg`
3. `Bilder/Heck.jpg`
4. `Bilder/hinten rechts.jpg`
5. `Bilder/links.jpg`
6. `Bilder/rechts.jpg`
7. `Bilder/Vorne rechts.jpg`
8. `Bilder/Specs.jpg`
9. `Bilder/Mängel.jpg`

### Uploadmechanik

1. Dateien über `chrome.runtime.getURL` und `fetch` lesen, daraus `File`-Objekte
   mit MIME-Typ `image/jpeg` erstellen.
2. Alle Dateien einem `DataTransfer` hinzufügen, dessen `files` auf
   `#image-upload[type=file].files` setzen und ein `change`-Event auslösen.
   Der Betriebssystem-Dateiauswahldialog wird dafür nicht benötigt.
3. Auf neun `button[aria-label="Bild entfernen"]` warten und prüfen, dass keine
   sichtbare `aria-busy="true"`-Anzeige mehr vorhanden ist.
4. Bilderstatus `uploaded` speichern, dann `steps-continue-button` anklicken.
5. Bei vollständigem Fehlschlag eventuell sichtbaren „Verstanden“-Dialog
   schließen, Status `skipped` speichern und **Weiter ohne Bilder** anklicken.
6. Bei einem Teil-Upload stoppen und konkrete Meldung anzeigen, damit eine
   Wiederaufnahme keine doppelten Bilder erzeugt. Vorhandene Teilbilder manuell
   vervollständigen oder entfernen; bei neun vorhandenen Bildern gilt der
   Upload als vollständig. Bereits gespeicherte Uploads werden nicht wiederholt.

Im Detailformular dieselbe Uploadfunktion verwenden, falls Schritt 4 übersprungen
wurde. Die endgültige Reihenfolge der serverseitigen Vorschauen ist zusätzlich
auf der Live-Seite prüfbar; der Browser übergibt die Dateien in obiger Reihenfolge.

**Erwartung:** vollständiges Detailformular mit `publish-button`.

## 10. Schritt 5 – Details

**URL:** `https://www.autoscout24.de/manual-listing-creation/private/vehicle-listing/`

**Erkennung:** sichtbarer `[data-testid="publish-button"]`.

Abschnitte über `[data-testid="sidebar-item-<name>"]` öffnen, Werte aus der
Vorlage eintragen, mit dem abschnittsspezifischen Weiter-Button abschließen und
jeden abgeschlossenen Abschnitt speichern. Ein sichtbares `aria-invalid=true`
nach Weiter unterbricht den Ablauf.

Für Comboboxen gelten unten die `aria-labelledby`-Werte (mit
`[role=combobox]` kombinieren); für normale Inputs/Checkboxen/Radios die IDs.

| Abschnitt `<name>` | Felder und Werte | Weiter-Test-ID |
| --- | --- | --- |
| `vehicle-data` | `make` Ford; `model` Fiesta; `#modelVersion` Fiesta 1.0 EcoBoost S | `vehicle-continue-button` |
| `characteristics` | `vehicleBody-label` Kleinwagen; `seats-label` 5; `doors-label` 5; `#bodyColor__2` Blau; `#metallic` true; `upholstery-label` Vollleder; `#interiorColor__2` Schwarz; `#emptyWeight` 1.216 | `characteristics-continue-button` |
| `condition` | `vehicleOfferType-label` Gebraucht; `#mileage` 32.500; Erstzulassung 06.2020; `previousOwnersLabel` 1; `#fullServiceHistory` true; `#nonSmoking` true; HU/AU 07.2027; `#damaged__false`, `#accident__false`, `#roadworthy__true` markieren | `condition-continue-button` |
| `equipment` | Sämtliche Equipment-Checkboxen gemäß Vorlage, `alloyWheelSize` 17 | `equipment-continue-button` |
| `motor` | `motorSectionDriveTypeLabel` Front; `motorSectionTransmissionLabel` Automatik; `#powerKw` 74; `#powerPS` 101; `motorgearLabel` 5; `motorcylinderLabel` 3; `#cylinderCapacity` 998 | `motor-continue-button` |
| `fuel` | `fuelCategory` Benzin; `#environmentalProtocol-nedc` markieren; `primaryFuelType` Super E10 95; `#fuelConsumptionCombined` 5,6; `#co2` 128; `efficiencyClass` B; `pollutionClass` Euro 6d-TEMP; `#emissionSticker__4` Grün | `fuel-continue-button` |
| `photos` | Neun Bilder gemäß Schritt 4; bereits erledigten Upload nicht wiederholen | `image-continue-button` |
| `description` | Vollständiges HTML aus `#description` der Vorlage | `description-continue-button` |
| `financing-offer` | `#price` 15.200; `#priceNegotiable` false; `#taxDeductible` false | `financingOffer-continue-button` |
| `contact` | Vier Kontaktfelder gemäß Schritt 2 | Kein eigener Weiter-Button; anschließend Veröffentlichen |

### Vollständige Ausstattung

Alle vorhandenen Equipment-Checkboxen berücksichtigen, auch nicht markierte.
Die folgenden Werte sind markiert (numerische IDs entsprechen dem Suffix von
`<gruppe>-equipments-<id>`). Andere vorhandene Equipment-IDs sind nicht markiert:

| Gruppe | Markierte IDs |
| --- | --- |
| airbag | 3, 2, 46, 32 |
| assistenzsysteme | 232, 137, 189, 227, 148, 157, 158, 162 |
| einparkhilfe | 130, 131, 129, 128 |
| extras | 211, 15, 173, 54, 225, 29, 218, 215, 231 |
| klimatisierung | 5, 30 |
| komfort | 134, 135, 136, 13, 121, 142, 126, 113 |
| licht | 140, 141, 126, 19, 115 |
| sicherheit | 1, 42, 125, 146, 149, 150, 31, 26 |
| sitze | 34, 117, 21 |
| tempomat | 133, 38 |
| unterhaltung | 222, 221, 138, 223, 155, 156, 159, 161 |
| unterhaltung/media | 122, 41, 124, 114, 23, 10 |
| zentralverriegelung | 153, 17, 47 |

Von AutoScout24 deaktivierte, ohnehin nicht markierte Checkboxen überspringen.
Die Vorlage und ihre Labels enthalten die vollständigen Klartextbezeichnungen.

### Datumsdialoge

Erstzulassung über `registrationDate-datePicker`, HU/AU über den zweiten
DatePicker im geöffneten Zustandsabschnitt finden. Stimmt der sichtbare Wert
bereits, nichts verändern. Andernfalls den Button `aria-haspopup=dialog`
öffnen, Dialog über `aria-describedby` beziehungsweise `role=dialog` finden,
Jahr/Monat über Selects, semantische Comboboxen oder Jahr-/Monatsbuttons wählen.
Bei Jahresnavigation höchstens 30 Schritte; anschließend den exakten Wert
`MM.JJJJ` am ursprünglichen Button prüfen.

Der geöffnete Datumsdialog fehlt in den gelieferten Snapshots. Die Umsetzung
unterstützt mehrere semantische Varianten, ist hier aber noch nicht an der
Live-Oberfläche verifiziert. Bei unbekanntem Aufbau das angeforderte Datum
manuell einstellen, Dialog schließen und **Fortsetzen** klicken. Ein Abschnitt
wird erst nach erfolgreichem Abschluss als erledigt gespeichert.

### Beschreibung

Den bearbeitbaren Textbereich
`#description[contenteditable="true"]` fokussieren, nur dessen Inhalt per DOM-
Range selektieren und über `document.execCommand("insertHTML", false, html)`
ersetzen. Dadurch wird der Tiptap/ProseMirror-Editor über den Bearbeitungsweg
angesprochen. Danach ein `input`-Event senden und den vollständigen Text prüfen.
Ein bloßes Setzen von `innerHTML` auf der Live-Seite reicht für den Editor nicht.

Die vollständige Beschreibung inklusive Highlights, formatierten Listen,
Absätzen, horizontaler Trennlinie und **Bekannte Mängel** kommt aus der Vorlage.
Insbesondere Kratzer hinten rechts und das kleine Loch im Beifahrersitz dürfen
nicht verloren gehen. Auch ursprüngliche Schreibweisen bleiben erhalten.

### Veröffentlichung

1. Alle zehn Detailabschnitte müssen erfolgreich abgearbeitet sein.
2. Auf aktivierten `[data-testid="publish-button"]` warten.
3. **Vor dem Klick** `publishClicked=true` persistent speichern.
4. Button **Veröffentlichen** anklicken.
5. Bei sichtbaren Fehlern einen Fehlerstatus speichern. Bei expliziter
   Erfolgsmeldung in einer Überschrift/Statusanzeige `done` setzen.
6. Ohne erkennbare Erfolgsbestätigung oder nach Navigation `submitted` setzen:
   Der Klick ist erfolgt, das Ergebnis ist auf AutoScout24 zu prüfen.

Kein automatischer zweiter Veröffentlichungsklick nach Reload oder Fortsetzen.
Ein Klick allein beweist keine erfolgreiche Freischaltung des Inserats.

## 11. Zustandsmaschine und Wiederaufnahme

Ein aktiver Ablauf insgesamt, gebunden an eine konkrete Tab-ID. Zustand in
`chrome.storage.local.autoscout24Run`:

```js
{
  id: "UUID",                // neue ID bei Start, Stop und Fortsetzen
  tabId: 123,
  status: "running",         // running | stopped | error | submitted | done
  step: 0,                   // 0 bis 5
  message: "…",
  completed: [],             // Namen erfolgreich erledigter Detailabschnitte
  images: "pending",         // pending | uploaded | skipped
  publishClicked: false,
  updatedAt: 0
}
```

Nachrichten: `GET_RUN`, `GET_RUN_FOR_TAB`, `GET_TEMPLATE`, `START`, `STOP`,
`RESUME`, `UPDATE`. Der Worker verarbeitet Änderungen seriell. `UPDATE` wird
nur bei passender Ablauf-ID, passender Sender-Tab-ID und Status `running`
akzeptiert. Dadurch überschreiben verspätete Antworten einen Stopp nicht.

Content Scripts prüfen alle 1,5 s und bei Storage-Änderungen, ob der eigene Tab
zuständig ist. Pro Dokument läuft höchstens eine Bearbeitung gleichzeitig.
Neu geladene Dokumente erkennen den aktuellen Schritt am DOM und setzen fort.
Die Website verwaltet dabei die schon übernommenen Formularwerte; die Extension
speichert den Fortschritt, nicht eine eigene Kopie des serverseitigen Entwurfs.

Bei Schließen des Inserat-Tabs wird der Ablauf gestoppt. Zum Fortsetzen müssen
der ursprüngliche Tab und ein unterstützter AutoScout24-Host verfügbar sein.
Nach einem Veröffentlichungsklick ist Fortsetzen deaktiviert. **Starten**
beginnt bewusst einen neuen Ablauf auf der Verkaufsstartseite.

## 12. Prüfung und Vorlage für Playwright

### Vorhandene Offline-Prüfung

```sh
npm install
npm run check
npm test
```

Die Tests prüfen Manifest/Icon-Dateien, vollständige Profilauswertung,
DOM-Erkennung sämtlicher Snapshots, Kontakt/Preis, echte Combobox-Auswahl,
Abbruch während eines Wartevorgangs, Bilder-Fallback, Tabbindung, konkurrierende
Starts, veraltete Statusänderungen und den vollständigen Detailablauf mit
Checkpoint vor genau einem Veröffentlichungsklick. jsdom simuliert hierfür die
Website und den nativen Bearbeitungsbefehl; dies ist kein Live-End-to-End-Test.

### Reproduzierbarer Playwright-Testentwurf

1. Chromium mit persistentem temporärem Profil und geladener unpacked Extension
   starten (`--disable-extensions-except=<root>`, `--load-extension=<root>`).
   Einen geeigneten Chromium-Build mit Unterstützung dieser Flags verwenden.
2. Extension-ID aus der Service-Worker-URL ermitteln. Popup über
   `chrome-extension://<id>/popup.html` oder Browser-Action öffnen.
3. AutoScout24-Routen in einem Offline-Test abfangen. Snapshots ohne externe
   Seitenscripts ausliefern; die nötige simulierte Formularlogik hinzufügen.
   Snapshots sind DOM-Aufnahmen, keine funktionsfähige lokale AutoScout24-App.
4. Schritt 0: nach Start auf „Inserat erstellen“ klicken lassen und prüfen,
   dass der kontrollierte Tab auf die korrekte Einstiegs-URL navigiert.
5. Schritt 1: Vorschlagslisten nach Eingaben anbieten, abhängige Controls erst
   nach Auswahl freischalten. Auf alle Werte aus Abschnitt 6 prüfen. Auch die
   nicht verfügbare Variante mit offiziellem manuellem Fallback testen.
6. Schritte 2/3: bei Weiter den nächsten DOM im selben Tab rendern. Auf
   81925 München, +49, Rufnummer, `hidePhoneNumber=false`, 15.200 €, 32.500 km,
   einen Halter und beide Zustandscheckboxen prüfen.
7. Schritt 4: `input.files` muss neun JPEGs in definierter Reihenfolge enthalten.
   Für erfolgreiche Uploads neun Vorschaukarten simulieren. Zusätzlich
   vollständigen Fehlschlag und Teil-Upload testen.
8. Schritt 5: Sidebar und Weiter-Buttons reagieren lassen. Datumsdialoge für
   06.2020/07.2027 simulieren, sämtliche Equipment-Zustände und Motor-/Umwelt-
   werte prüfen, vollständigen Beschreibungstext einschließlich Mängeln prüfen.
9. Den Veröffentlichungsklick in einem Test abfangen und zählen; dabei muss
   `publishClicked` schon gespeichert sein. Explizite Erfolgsmeldung sowie
   Weiterleitung ohne bestätigten Erfolg getrennt prüfen.
10. Reload zwischen Schritten, Schließen des Popups, zweiten AutoScout24-Tab,
    Stopp während einer Wartezeit und Fortsetzen nach Validierungsfehler testen.

Für einen Live-Test zusätzlich die tatsächlichen Optionsbezeichnungen,
Datumsdialoge, React-/Editor-Übernahme, Upload-Ende, eventuelle Login-Weiterleitung
und die endgültige Veröffentlichungsbestätigung prüfen. Ein Live-Test, der bis
zum letzten Klick läuft, erstellt tatsächlich ein Inserat.

## 13. Weitere Plattformen

`profile.js` ist als wiederverwendbare Fahrzeugdatenquelle angelegt. Neue
Plattformen können einen eigenen DOM-Adapter und eine eigene Ablaufsteuerung
erhalten. Popup-Hosterkennung, Manifest-Hosts und Worker-Plattformauswahl müssen
dann um den konkreten Anbieter erweitert werden. Aktuell ist AutoScout24 der
implementierte Anbieter.
