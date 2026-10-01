# Spezifikation: Fiesta-Verkäufer für AutoScout24

## 1. Ziel und Bedienung

Chrome-Extension (Manifest V3), die das vorgegebene Ford-Fiesta-Inserat auf
AutoScout24.de erstellt. Ein Klick auf **Auf AutoScout24 inserieren** startet
Schritt 0 im aktiven Tab. Anschließend werden Fahrzeug, Kontakt, Preis/Zustand,
Bilder und Details ausgefüllt und **Veröffentlichen** angeklickt. Danach folgt
Schritt 6: auf der Paket-Auswahl **Kostenlos weiter** anklicken. Das Popup zeigt
entsprechend Schritt 0 bis 6.

Das Popup zeigt Fahrzeugübersicht, Status, aktuellen Schritt, Fortschrittsbalken,
**Stoppen** und bei einer Unterbrechung **Fortsetzen**. Der Startbutton erscheint
nur bei `https://www.autoscout24.de/*` beziehungsweise `https://autoscout24.de/*`.
Das Popup darf während des Ablaufs geschlossen werden.

Auf anderen Seiten erscheint stattdessen der Button **AutoScout24.de öffnen,
um dein Auto zu inserieren**. Er öffnet die Verkaufsstartseite in einem neuen
aktiven Tab und schließt das Popup. Dort kann das Inserieren über die Extension
gestartet werden.

Voraussetzungen: lokal geladene Extension einschließlich der Vorlage und aller
Bilder, AutoScout24-Konto und erforderlichenfalls Anmeldung im Inserat-Tab.
Login, CAPTCHA und unbekannte Dialoge werden auf der Website bedient. Wenn ein
benötigtes Feld nicht erreichbar ist, meldet die Extension den konkreten
Selektor beziehungsweise die Auswahl und kann danach fortgesetzt werden.

## 2. Quellen und ihre Besonderheiten

| Quelle | Verwendung |
| --- | --- |
| `autoscout24.de_sell_car_form_page_0.html` | Verkaufsoptionen/Entscheidungsseite, Link `#market-place-link`; live auch nach Fahrzeugauswahl |
| `autoscout24.de_sell_car_form_page_1.html` | Abhängige Fahrzeugauswahl (`psuf-vehicle-insertion-form-*`) |
| `autoscout24.de_sell_car_form_page_2.html` | Kontakt-Miniformular |
| `autoscout24.de_sell_car_form_page_3.html` | Preis/Zustand-Miniformular |
| `autoscout24.de_sell_car_form_page_4.html` | Ursprünglich Bilder-Miniformular; inzwischen vom Nutzer durch die Paket-Auswahl für Schritt 6 ersetzt |
| `autoscout24.de_sell_car_form_page_5.html.lnk` | Windows-Verknüpfung auf **page_4.html**, kein eigenständiger Detailsnapshot |
| `autoscout24.de_sell_car_form_page_6.html.lnk` | Verknüpfung auf **page_4.html**; aktuelle Quelle für „Kostenlos weiter“. Eine eigenständige `page_6.html` liegt nicht vor |
| `tests/fixtures/images-mini.html` | Lokale Test-Fixture des Bilder-Miniformulars; Abschlusszustände anhand der Bildkarten-HTML-Beispiele und der ausgefüllten Vorlage |
| `autoscout24-form-filled.html` | Verbindliche Datenquelle und DOM-Grundlage für das vollständige Detailformular |
| `Bilder/*.jpg` | Neun lokale Fahrzeugbilder |

Der Link im Snapshot von Schritt 0 enthält abweichende Beispieldaten (unter
anderem Diesel, Schaltgetriebe und 2025) und öffnet einen neuen Tab. Die Live-Seite
erzeugt diesen Link aus den gerade gewählten Fahrzeugdaten. Sein `href` bleibt
deshalb erhalten; ausschließlich `target` wird auf `_self` gesetzt. Der gespeicherte
Snapshot dient als DOM-Vorlage, seine Beispielparameter werden nicht übernommen.

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
  Zuerst vorhandene Vorschläge prüfen; erst wenn keiner passt, Suchtext setzen.
  Für die Karosserie nur nach „Kleinwagen“ suchen, nicht nach dem zusammengesetzten
  Anzeigetext „Kleinwagen, 5 Türen“. Neben Options-/Listenelementen werden auch
  Buttons innerhalb der zugehörigen Vorschlagsliste unterstützt. Optionen mit
  `mousedown`-Handler werden außerhalb der AutoScout24-Komponente über
  `mousedown`, `mouseup` und Klick angesprochen. Die AutoScout24-Komponente
  (`[data-autosuggest]`) wählt ihren Vorschlag direkt per Klick aus; synthetische
  Pointer-Ereignisse werden nicht gesendet.
- Abhängige Fahrzeugfelder nacheinander bedienen; erst nach Freischaltung des
  nächsten Controls fortfahren. Optionen werden exakt anhand normalisierter
  Texte oder ausdrücklich aufgeführter Aliase ausgewählt.
  Ein bereits passender Feldtext wird hier nur übersprungen, wenn das Folgefeld
  freigeschaltet ist. Andernfalls wird der passende Vorschlag erneut ausgewählt.
  Auch nach der Auswahl muss das Folgefeld freigeschaltet sein. Fehlermeldungen
  unterscheiden unbestätigten Feldtext von bestätigter Auswahl und nennen den
  aktuellen Feldtext sowie vorhandene Dropdown-Vorschläge.
- Bei der Live-Komponente wird eine abgebrochene Vorschlagssuche durch einen
  neuen Fokus zurückgesetzt. Ist das Input schon fokussiert, einmal `blur()` und
  `focus()` ausführen. Text-Inputs mit `[data-autosuggest]` öffnen ihre Liste beim
  Fokus; nicht zusätzlich über das Dropdown-Icon umschalten.
- Solange die `.loader`-Anzeige im eigenen Combobox-Container sichtbar ist,
  keinen neuen Suchtext setzen. Wenn eine geschlossene Liste länger als 5 s
  mit Loader verbleibt, höchstens zweimal erneut fokussieren. Bei Timeout
  „AutoScout24 lädt weiterhin die Vorschläge“ melden, nicht eine unbestätigte
  oder fehlende Auswahl behaupten.
- Muss ein bereits identischer Suchtext erneut verarbeitet werden, zunächst
  leeren, 100 ms auf das Rendern warten, Ablaufstatus prüfen und erneut eingeben.
  React ignoriert sonst unter Umständen das Input-Event für den unveränderten
  Wert. Eine automatisch bestätigte Auswahl während des Ladens erkennen, sobald
  der Solltext stimmt, das Folgefeld freigeschaltet ist und der Loader weg ist.
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
3. Die sichtbare Oberfläche per DOM erkennen: Fahrzeugauswahl, Verkaufsoptionen
   oder direktes Detailformular. Der URL-Pfad allein unterscheidet diese nicht.
4. Bei Verkaufsoptionen `#market-place-link` suchen; alternativ sichtbaren
   Link/Button mit genau „Inserat erstellen“. Das vorhandene Linkziel erhalten,
   `target` auf `_self` setzen und anklicken.
5. Wenn auf der Startseite noch kein Formular erkannt wird, bis zu 5 s auf dessen
   Erscheinen warten. Bleibt die Startseite ohne Formular/Verkaufsoptionen,
   auf die vorgegebene Einstiegs-URL von Schritt 1 navigieren.

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
| 5 | `select-body-type-and-doors` | Kleinwagen, 5 Türen; Aliase: „Kleinwagen 5 Türen“, „Kleinwagen (5 Türen)“, „Kleinwagen / 5 Türen“, „Kleinwagen, 4/5 Türen“; Suchtext „Kleinwagen“ |
| 6 | `select-fuel-category` | Benzin |
| 7 | `select-transmission` | Automatik |
| 8 | `select-power` | 74 kW (101 PS); Aliase: „74 kW (100 PS)“, „74 kW / 101 PS“, „101 PS (74 kW)“, „100 PS (74 kW)“ |
| 9 | `select-model-version` | Fiesta 1.0 EcoBoost S; vollständiger Katalog-Alias: „Fiesta 1.0 EcoBoost S&S Aut. VIGNALE (2017 - 2020)“ |
| 10 | `mileage` | 32.500 |
| 11 | `go-next-button-default` | Weiter anklicken, sobald aktiviert |

Falls die Variante im Fahrzeugkatalog nicht verfügbar ist, den offiziellen
`[data-testid="no-vehicle-fallback-link"]` verwenden. Dessen vorhandene
Fahrzeugparameter bleiben erhalten; `mileage=32500` und
`version=Fiesta 1.0 EcoBoost S` ergänzen und im selben Tab öffnen. Das komplette
Detailformular übernimmt anschließend alle verbindlichen Daten.

Die live gelieferte Variantenliste enthält mehrere Einträge mit identischem
Präfix „Fiesta 1.0 EcoBoost S“, beispielsweise ST-LINE X, TITANIUM X und VIGNALE.
Die Beschreibung der Vorlage nennt ausdrücklich Vignale. Deshalb den kompletten
Vignale-Eintrag auswählen, nicht den ersten Präfixtreffer oder eine nur per
`aria-selected=true` hervorgehobene Option. Im übermittelten DOM ist der passende
Eintrag `psuf-vehicle-insertion-form-select-model-version-suggestion-7`; die
Auswahl erfolgt über den vollständigen Text, nicht über diese positionsabhängige
ID. Nach dem Klick den vollständigen übernommenen Labeltext und das aktivierte
Kilometerfeld prüfen. Der freie Inseratstitel im Detailformular bleibt der Wert
aus der Vorlage.

**Erwartung:** Verkaufsoptionen, Kontakt-Miniformular oder vollständiges Detailformular.

### Schritt 1a – Verkaufsoptionen: Inserat erstellen

Nach **Weiter** in der Fahrzeugauswahl kann auf derselben URL die Seite
„Optionen für deinen Ford Fiesta …“ erscheinen. Diese hat links **Termin
vereinbaren** für den Händlerverkauf und rechts **Inserat erstellen** für den
AutoScout24-Marktplatz. Dies ist der Zustand `marketplace`, kein Kontaktformular.

1. Den sichtbaren `#market-place-link` erkennen, alternativ einen Link/Button
   mit genau „Inserat erstellen“. Die Erkennung hat Vorrang vor dem URL-basierten
   Startseitenzustand, aber folgt der Erkennung der tatsächlichen Formulare.
2. Status „Verkaufsoptionen: Inserat erstellen …“ anzeigen.
3. Linkziel inklusive Fahrzeugparametern unverändert lassen. Bei einem Link
   nur `target="_self"` setzen, damit derselbe kontrollierte Tab weiterläuft.
4. **Inserat erstellen** anklicken, nicht **Termin vereinbaren**.
5. Auf Kontakt-, Detail- oder gegebenenfalls Fahrzeugformular warten (30 s).
   Nach erfolgreicher Fahrzeugauswahl sind auch die Verkaufsoptionen selbst
   ein gültiger nächster Zustand; nicht schon hier auf Kontaktdaten warten.

Dieser Zwischenschritt wird sowohl nach Fahrzeugauswahl als auch beim Fortsetzen
auf einer bereits geöffneten Optionsseite ausgeführt.

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

**URL:** wie Schritt 2. **DOM-Grundlage:** ursprünglicher Bilder-Snapshot,
ausgefüllte Vorlage und die vom Nutzer gelieferten Lade-/Fertig-Bildkarten.
`page_4.html` enthält inzwischen die Paket-Auswahl für Schritt 6; die Bilder-
Miniformular-Fixture liegt unter `tests/fixtures/images-mini.html`.
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
3. Zu jedem `button[aria-label="Bild entfernen"]` dessen nächstes
   `[class*="SortableImage_imageContainer"]` bestimmen; falls diese Struktur
   fehlt, den Elterncontainer verwenden. Mindestens neun Karten müssen existieren.
   Die Anzahl der Entfernen-Buttons allein bestätigt keinen fertigen Upload.
4. Jede Karte auf folgende Ladezustände prüfen, ohne generierte CSS-Hashes
   festzuschreiben: `[class*="SortableImage_loadingWrapper"]`,
   `[class*="SortableImage_imageLoading"]`, `.sr-spinner-wrapper`, `.sr-spinner`,
   `[aria-busy="true"]` oder ein Absatz mit „Lädt“, „Wird hochgeladen“, „Uploading“
   beziehungsweise „Loading“. Schon eine solche Karte blockiert das Fortfahren.
5. Erst wenn alle vorhandenen Karten für mindestens 600 ms durchgehend frei von
   Ladezuständen sind, den Upload als abgeschlossen behandeln. Insgesamt bis zu
   120 s warten und „Fahrzeugbilder: X/9 fertig hochgeladen …“ im Popup anzeigen.
6. Bilderstatus `uploaded` speichern, dann `steps-continue-button` anklicken.
7. Bei vollständigem Fehlschlag eventuell sichtbaren „Verstanden“-Dialog
   schließen, Status `skipped` speichern und **Weiter ohne Bilder** anklicken.
8. Bei einem Teil-Upload stoppen und konkrete Meldung anzeigen, damit eine
   Wiederaufnahme keine doppelten Bilder erzeugt. Vorhandene Teilbilder manuell
   vervollständigen oder entfernen. Sind noch ladende Karten vorhanden, auf deren
   Abschluss einschließlich aller neun Karten warten, statt erneut Dateien zu
   übergeben. Auch neun vorhandene Karten und ein gespeicherter Status `uploaded`
   müssen die vollständige Ladeprüfung bestehen. Dateien nicht erneut hochladen.

Im Detailformular dieselbe Uploadfunktion verwenden, falls Schritt 4 übersprungen
wurde. Die endgültige Reihenfolge der serverseitigen Vorschauen ist zusätzlich
auf der Live-Seite prüfbar; der Browser übergibt die Dateien in obiger Reihenfolge.

**Erwartung:** vollständiges Detailformular mit `publish-button`.

## 10. Schritt 5 – Details

**URL:** `https://www.autoscout24.de/manual-listing-creation/private/vehicle-listing/`

**Erkennung:** sichtbarer `[data-testid="publish-button"]`.

Abschnitte über `[data-testid="sidebar-item-<name>"]` öffnen, Werte aus der
Vorlage prüfen/ergänzen und jeden erfolgreich bearbeiteten Abschnitt speichern.
Vorhandene passende Werte werden beibehalten. Die Statusanzeige verwendet die
deutschen Abschnittsnamen, beispielsweise „Details: Fahrzeugdaten prüfen und
ergänzen …“.

Es gibt zwei Formularlayouts:

- **Mit Abschnittsbuttons:** Sichtbaren abschnittsspezifischen Weiter-Button
  anklicken. Ist er deaktiviert, auf Aktivierung warten; nicht überspringen.
- **Durchgehendes Detailformular:** Mehrere Abschnitte sind gleichzeitig sichtbar,
  und ihre Weiter-Buttons fehlen oder sind verborgen. Erkennung über den sichtbaren
  `#modelVersion`-Input und die Combobox `vehicleBody-label` aus dem Folgeabschnitt.
  Nach erfolgreicher Feldübernahme zum nächsten Abschnitt über die Sidebar gehen.
  Kein unsichtbarer oder nicht vorhandener Weiter-Button muss angeklickt werden.

Die unten genannten Weiter-Test-IDs gelten für das Layout mit Abschnittsbuttons.
Vor dem Speichern des Abschnitts und nach einem optionalen Weiter-Klick prüfen,
ob eines der zu diesem Abschnitt gehörenden Profilfelder `aria-invalid=true`
hat. Die Fehlermeldung nennt den deutschen Abschnittsnamen und das Feldlabel.
Vor „Veröffentlichen“ außerdem alle sichtbaren ungültigen Felder prüfen. Fehlt
ein Weiter-Button in einer nicht erkannten Formularansicht, konkret diese
Ansicht melden, statt lediglich „Nicht verfügbar: Weiter (vehicle-data)“.

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
6. Wenn die Paket-Auswahl sichtbar ist, Schritt 6 ausführen. Andernfalls bei noch
   unbestätigtem Ergebnis `running` beibehalten und auf den kostenlosen Abschluss
   warten. Eine Weiterleitung nach „Veröffentlichen“ allein beendet den Ablauf
   nicht. Explizite Erfolgsmeldungen ohne zusätzliche Paket-Auswahl sind zulässig.

Kein automatischer zweiter Veröffentlichungsklick nach Reload oder Fortsetzen.
Ein Klick allein beweist keine erfolgreiche Freischaltung des Inserats.

## 11. Schritt 6 – Paket-Auswahl kostenlos abschließen

**Quelle:** `autoscout24.de_sell_car_form_page_6.html.lnk` verweist auf die aktuell
vorliegende `autoscout24.de_sell_car_form_page_4.html`. Diese enthält den Container
`#ppp-container` mit Paket-Auswahl („Verkaufe schneller“), kostenpflichtigem Turbo-
Button und separatem kostenlosen Link. Die Quellaufnahme ist ein DOM-Fragment
ohne verbindlich dokumentierte Seiten-URL; Erkennung erfolgt über den DOM.

1. `[data-testid="productSelection-continueFree"]` erkennen, alternativ sichtbaren
   Link/Button mit genau „Kostenlos weiter“. Neuer Formularzustand: `packages`.
2. Auf aktiviertes Control warten (30 s); Status „Paket-Auswahl: kostenlos
   abschließen …“ und Fortschritt Schritt 6 anzeigen.
3. **Vor dem Klick** `freeContinueClicked=true` persistent speichern.
4. Den kostenlosen Link anklicken; `href="/account/listings"` erhalten und
   `target="_self"` setzen. Nicht den Button
   `[data-cy="product-selection-cta-button"]` („Weiter mit Turbo (€ 28,99)“)
   und nicht die Gutschein-Einlösung anklicken.
5. Bei erkannter ausdrücklicher Veröffentlichungsbestätigung `done` setzen.
   Ansonsten `submitted` setzen und „Kostenlos weiter wurde angeklickt. Bitte
   das Inserat unter Meine Inserate prüfen“ anzeigen. Eine Navigation auf
   `/account/listings` bestätigt allein nicht die Freischaltung des Inserats.

Der Abschluss kann nach SPA-Wechsel oder vollständigem Dokumentwechsel erfolgen.
Nach `publishClicked=true` werden nur Paket-Auswahl, Erfolgsmeldung oder die
Inseratsübersicht geprüft; das Detailformular wird nicht erneut veröffentlicht.
Nach `freeContinueClicked=true` wird der Abschlussklick nicht wiederholt.

## 12. Zustandsmaschine und Wiederaufnahme

Ein aktiver Ablauf insgesamt, gebunden an eine konkrete Tab-ID. Zustand in
`chrome.storage.local.autoscout24Run`:

```js
{
  id: "UUID",                // neue ID bei Start, Stop und Fortsetzen
  tabId: 123,
  status: "running",         // running | stopped | error | submitted | done
  step: 0,                   // 0 bis 6
  message: "…",
  completed: [],             // Namen erfolgreich erledigter Detailabschnitte
  images: "pending",         // pending | uploaded | skipped
  publishClicked: false,
  freeContinueClicked: false,
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
Nach einem Veröffentlichungsklick bleibt Fortsetzen für den noch offenen
kostenlosen Abschluss möglich; dabei das Detailformular nicht erneut bedienen.
Auch ein von einer älteren Extension-Version als `submitted` gespeicherter
Ablauf mit `publishClicked=true` und ohne kostenlosen Abschluss darf über das
Popup fortgesetzt werden. So kann eine schon geöffnete Paket-Auswahl abgeschlossen
werden, ohne ein neues Inserat zu starten.
Nach dem kostenlosen Abschlussklick ist Fortsetzen deaktiviert. Bei Änderungen
der Tab-URL nach Veröffentlichung bleibt der Worker bis zum kostenlosen
Abschluss im Status `running`; erst nach dessen Klick wird eine Weiterleitung
als `submitted` gespeichert. **Starten**
beginnt bewusst einen neuen Ablauf auf der Verkaufsstartseite.

## 13. Prüfung und Vorlage für Playwright

### Vorhandene Offline-Prüfung

```sh
npm install
npm run check
npm test
```

Die Tests prüfen Manifest/Icon-Dateien, vollständige Profilauswertung,
DOM-Erkennung sämtlicher Snapshots, Kontakt/Preis, echte Combobox-Auswahl,
die Wiederaufnahme bei eingetragenem, aber unbestätigtem Karosserietext,
Freischaltung des Kraftstofffelds, Vorschlagsauswahl über `mousedown`, Suche
nach dem Karosserienamen und Fehlermeldungen bei abweichender Türanzahl,
erneuten Fokus nach abgebrochenen Modellvorschlägen, verzögertes Laden ohne
zwischenzeitliche Suche, wiederholte kontrollierte Eingaben mit identischem Wert
und eine spezifische Fehlermeldung bei fortdauerndem Laden,
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
4. Schritt 0: nach Start Fahrzeugformular oder Verkaufsoptionen rendern lassen.
   Bei Verkaufsoptionen prüfen, dass „Inserat erstellen“ im kontrollierten Tab
   öffnet und sein erzeugtes Linkziel inklusive Fahrzeugparametern erhalten bleibt.
5. Schritt 1: Vorschlagslisten nach Eingaben anbieten, abhängige Controls erst
   nach Auswahl freischalten. Auf alle Werte aus Abschnitt 6 prüfen. Auch die
   nicht verfügbare Variante mit offiziellem manuellem Fallback testen.
6. Nach Weiter der Fahrzeugauswahl zunächst die Verkaufsoptionen rendern.
   Den Klick auf „Inserat erstellen“ prüfen; „Termin vereinbaren“ darf nicht
   angeklickt werden. Erst dieser Klick liefert den Kontaktdaten-DOM.
   Schritte 2/3: bei Weiter den nächsten DOM im selben Tab rendern. Auf
   81925 München, +49, Rufnummer, `hidePhoneNumber=false`, 15.200 €, 32.500 km,
   einen Halter und beide Zustandscheckboxen prüfen.
7. Schritt 4: `input.files` muss neun JPEGs in definierter Reihenfolge enthalten.
   Für erfolgreiche Uploads neun Vorschaukarten simulieren. Zunächst eine davon
   ausgegraut mit `loadingWrapper`, `imageLoading`, „Lädt“ und Spinner darstellen.
   Der Weiter-Klick muss warten, auch wenn alle Entfernen-Buttons schon vorhanden
   sind oder `images=uploaded` gespeichert ist. Die einzelnen Ladeindikatoren
   nacheinander entfernen; erst nach dem letzten und 600 ms stabiler Bereitschaft
   fortfahren. Zusätzlich vollständigen Fehlschlag, Teil-Upload und Stop testen.
8. Schritt 5: Sidebar und Weiter-Buttons reagieren lassen. Datumsdialoge für
   06.2020/07.2027 simulieren, sämtliche Equipment-Zustände und Motor-/Umwelt-
   werte prüfen, vollständigen Beschreibungstext einschließlich Mängeln prüfen.
9. Den Veröffentlichungsklick in einem Test abfangen und zählen; dabei muss
   `publishClicked` schon gespeichert sein. Danach die Paket-Auswahl ausliefern,
   auch mit vollständigem Dokumentwechsel. Prüfen, dass der Worker aktiv bleibt,
   ausschließlich „Kostenlos weiter“ klickt und dessen eigener Checkpoint zuvor
   gespeichert ist. Explizite Erfolgsmeldung sowie Weiterleitung ohne bestätigten
   Erfolg getrennt prüfen. Beide Klicks dürfen nach Reload nicht wiederholt werden.
10. Reload zwischen Schritten, Schließen des Popups, zweiten AutoScout24-Tab,
    Stopp während einer Wartezeit und Fortsetzen nach Validierungsfehler testen.

Für einen Live-Test zusätzlich die tatsächlichen Optionsbezeichnungen,
Datumsdialoge, React-/Editor-Übernahme, Upload-Ende, eventuelle Login-Weiterleitung
und die endgültige Veröffentlichungsbestätigung prüfen. Ein Live-Test, der bis
zum letzten Klick läuft, erstellt tatsächlich ein Inserat.

## 14. Nachprüfung der Live-Combobox

Die öffentlich ausgelieferte UI-Komponente wurde zusätzlich read-only über
`node tools/inspect_live_autosuggest.cjs` untersucht. Dabei wurden keine
Inseratdaten gesendet. Aktueller geprüfter Bundle-Pfad:
`/assets/private-seller-unified-flow/_next/static/chunks/a182e9db-2f62e6088a09d21a.js`.
Dieser Hash ist eine Diagnosequelle, kein Laufzeitselektor.

Relevante Komponentenlogik: Suchtext und ausgewähltes Objekt sind getrennt;
`onFocus` setzt `cancelFetchSuggestions` zurück; ein `pointerup` außerhalb der
Komponente setzt diesen Zustand und schließt die Vorschläge; ein abgebrochener
Vorschlags-Promise kann die Ladeanzeige unverändert lassen. Ein Vorschlag ist
ein `li[role=option]` mit `onClick`. Karosserie-Labels werden als
`<Name> <Türanzahl> Türen` erzeugt (ohne Komma). Die Regressionstests simulieren
diese Zustände; ein vollständiger Live-Browser-Test ist damit nicht ersetzt.

## 15. Weitere Plattformen

`profile.js` ist als wiederverwendbare Fahrzeugdatenquelle angelegt. Neue
Plattformen können einen eigenen DOM-Adapter und eine eigene Ablaufsteuerung
erhalten. Popup-Hosterkennung, Manifest-Hosts und Worker-Plattformauswahl müssen
dann um den konkreten Anbieter erweitert werden. Aktuell ist AutoScout24 der
implementierte Anbieter.

## 16. Zusatzfeature: Gesponserte Angebote ausblenden

Im Popup die Checkbox **Gesponserte Inhalte ausblenden** bereitstellen. Ohne
gespeicherten Wert ist sie aktiviert. Den booleschen Wert unter
`chrome.storage.local.hideSponsored` speichern. Einstellungen gelten unabhängig
vom Inseratablauf für alle AutoScout24-Tabs und werden über
`chrome.storage.onChanged` sofort aktualisiert. Bei einem Schreibfehler den
bisherigen Checkboxzustand wiederherstellen und eine Fehlermeldung anzeigen.

Separates Content Script `sponsored.js` und Stylesheet `sponsored.css` bei
`document_start` auf beiden AutoScout24-Hosts laden. Der Seitenzustand wird am
HTML-Element als `data-fiesta-hide-sponsored="true|false"` gesetzt. Während der
initialen Einstellungsabfrage gilt der aktivierte Standard; ein gespeichertes
`false` deaktiviert den Filter nach dem Lesen. Bei einer Einstellungsänderung
während der Abfrage darf eine ältere Antwort den neuen Wert nicht überschreiben.

Zu erkennende Angebotskarten:

- `article[data-relevance_adjustment="sponsored"]` (Marker aus dem Nutzerbeispiel)
- `article[data-relevance-adjustment="sponsored"]` (alternative Attributschreibweise)
- `article[data-testid="list-item"]:has([class*="ListItemSponsored_"])`
  (explizites Sponsored-Badge, unabhängig vom generierten CSS-Hash)

Bei aktivem Filter die gesamte Karte per `display: none !important` ausblenden.
Keine Karten entfernen und deren eigene Styles/Attribute nicht überschreiben.
Beim Ausschalten die Filterregel über den HTML-Zustand unwirksam machen.
CSS-Selektoren erfassen automatisch neu eingefügte und umgewidmete Karten;
ein MutationObserver oder regelmäßiges Durchsuchen der Ergebnisliste ist nicht
erforderlich. Organische Smyle-Angebote und Beschreibungen, die nur das Wort
„gesponsert“ erwähnen, sind kein Ausblendkriterium.

Offline-Tests in `tests/sponsored.test.cjs`: Nutzerbeispiel und Badge-Erkennung,
organische Ergebnisse, nachgeladene Angebote, reversible Deaktivierung,
gespeicherter Standard, konkurrierende Einstellungsänderung und Popup-Speicherung
einschließlich Schreibfehler. Für einen Browser-Test eine neue gesponserte Karte
einfügen und ihre Unsichtbarkeit prüfen; danach über das Popup deaktivieren und
in allen offenen AutoScout24-Tabs ihre Sichtbarkeit prüfen.
