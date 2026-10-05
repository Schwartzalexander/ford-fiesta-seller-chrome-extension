# Spezifikation: Ford Fiesta auf Kleinanzeigen inserieren

## 1. Ziel und gemeinsame Daten

Manifest-V3-Extension für AutoScout24 und Kleinanzeigen. Auf
`https://www.kleinanzeigen.de/*` beziehungsweise `https://kleinanzeigen.de/*`
erscheint **Auf Kleinanzeigen inserieren**. Ein Klick navigiert den aktiven Tab
auf `https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html` und startet
Schritt 0 bis 3. Auf anderen Hosts bieten zwei Popup-Buttons das Öffnen der Anbieter.
Das Popup darf geschlossen werden; der Ablauf läuft im zugewiesenen Tab weiter.

Ein aktiver Ablauf insgesamt. **Stoppen** unterbricht weitere Aktionen;
**Fortsetzen** setzt einen unterbrochenen Ablauf beim selben Anbieter fort.
Erforderliche Anmeldung, CAPTCHA, Telefonverifizierung oder unbekannte Dialoge
werden auf der Website erledigt; danach ist Fortsetzen möglich.

Gemeinsame Datenquelle: `profile.js` liest `autoscout24-form-filled.html` inert
mit `DOMParser`. Der aktuelle Preis ist dort als `listingPrice="14.500"`
konfiguriert; der alte Snapshotpreis wird vor der Extraktion ersetzt.
`FiestaKleinanzeigen.fromProfile` übersetzt das Profil in Kleinanzeigen-Felder.
Die Beschreibung stammt für beide Anbieter unmittelbar aus dem HTML-Editor der
Vorlage. AutoScout24 übernimmt die originale Rich-Text-Formatierung und prüft
deren Erhalt vor Veröffentlichung; Kleinanzeigen verwendet aufgrund seines
Textarea-Felds die hier dokumentierte Klartextdarstellung mit Absätzen und Listen.

- Titel **Ford Fiesta Vignale 1,0 l EcoBoost Automatik - Top Ausstattung**,
  ausdrücklich vom Nutzer vorgegeben, 62 Zeichen.
- Erstzulassung **06/2020**, Laufleistung **32.500 km**, Automatik, Benzin.
- Preis **14.500 €**, Festpreis entsprechend `priceNegotiable=false`.
- Leistung **101 PS** aus dem strukturierten AutoScout24-Feld. Die ursprüngliche
  Beschreibung nennt 100 PS; beide Quellwerte bleiben wie in der AutoScout24-Spec.
- Kleinwagen, fünf Türen, Blau, Vollleder, HU **07/2027**, grüne Plakette,
  Schadstoffklasse **Euro 6d-TEMP**.
- Standort **81925 München**; Kleinanzeigen-Ort im Snapshot **München - Bogenhausen**.
- Dieselben neun lokalen Bilder. Die Rufnummer **01715432107** ist eine gemeinsame
  Quellangabe für AutoScout24, wird auf Kleinanzeigen aber nicht automatisch in
  die Beschreibung geschrieben.

Alle für die gelieferten Formulare benötigten Fahrzeugangaben sind vorhanden.
Der Name ist in den Snapshots als **Alexander Schwartz** schreibgeschützt aus
dem Kleinanzeigen-Konto vorgegeben. Zur Laufzeit den vorhandenen Kontonamen
erhalten, nicht einen Snapshotnamen in ein anderes Profil schreiben. Ist er leer,
den fehlenden Profilnamen konkret melden und vor weiteren Aktionen klären lassen.

## 2. Verbindliche DOM-Quellen

| Datei | Tatsächlicher Inhalt |
| --- | --- |
| `kleinanzeigen.de_sell_car_form_page_0.html` | Anfangsformular mit Dateiupload, Titel, noch leerer Kategorie, Beschreibung, Preis, Standort und Kontoname |
| `kleinanzeigen.de_sell_car_form_kategorie.html` | Vorschläge mit Radios 216/223/280; keine vier nacheinander zu bedienenden Kategorie-Dialoge |
| `kleinanzeigen.de_sell_car_form_page_1.html` | Ford-Fiesta-Kategorie ausgewählt, neun Bilder vorhanden, neue Fahrzeugfelder, Button **Nächster Schritt** |
| `kleinanzeigen.de_sell_car_form_page_2.html` | Kostenloses **Basis Paket**, kostenpflichtiges **Plus Paket**, **Anzeige aufgeben** |
| `tests/fixtures/kleinanzeigen-package-unselected.html` | Relevante Struktur des zusätzlich vom Nutzer gelieferten neueren Paket-DOMs: beide Radios false, deaktivierter Weiter-Button |
| `autoscout24-form-filled.html` | Gemeinsame Fahrzeug-, Ausstattung- und Beschreibungsvorlage |
| `Bilder/*.jpg` | Tatsächlich hochzuladende lokale Dateien |

Die Kleinanzeigen-Snapshots sind Windows-1252-codierte DOM-Fragmente. Offline-
Tools/Tests lesen zuerst strikt UTF-8, dann bei Bedarf Windows-1252. Originaldateien
nicht umcodieren. Browser-DOMs liegen bereits als Unicode vor. Kategorienseparatoren
sind in den Aufnahmen teilweise `?`; Auswahl über strukturierte ID und validierten
Pfad, nicht über dieses Zeichen.

Astro-Props, CSRF-/Trackingwerte und signierte Bild-URLs aus den Aufnahmen werden
nicht auf die Live-Seite übertragen. Sitzung, Tokens und serverseitige IDs verwaltet
die Website. Nur reguläre DOM-Eingaben/Klicks und ihre Ereignisse verwenden.
Gespeicherte Bild-URLs sind kein Ersatz für das Hochladen der lokalen Dateien.

## 3. Aufbau und Berechtigungen

| Datei | Aufgabe |
| --- | --- |
| `platforms.js` | Hostkennung, Anbietername, Einstiegs-URL, letzte Schrittnummer 3 bzw. 6 |
| `background.js` | Ein aktiver, an Anbieter und Tab gebundener Ablauf; serielle Nachrichten; Vorlage liefern |
| `popup.html`, `popup.css`, `popup.js` | Anbieterabhängiger Startbutton, Website öffnen, Status, Stoppen/Fortsetzen |
| `profile.js` | Gemeinsames Fahrzeugprofil einschließlich aktivem Preis und Bildreihenfolge |
| `automation.js` | Gemeinsame DOM-/Warte-/Eingabehelfer; AutoScout24-Abläufe werden auf Kleinanzeigen nicht aufgerufen |
| `kleinanzeigen.js` | Datenmapping, Klartext, Kategorie, Comboboxen, Upload, Datenprüfung und Basis-Veröffentlichung |
| `kleinanzeigen-content.js` | Ablaufsteuerung und Wiederaufnahme über Dokument-/SPA-Wechsel |
| `tools/inspect_forms.py`, `tools/inspect_kleinanzeigen.cjs` | Offline-DOM-Auswertung mit Encoding-Erkennung |
| `tests/kleinanzeigen.test.cjs` | Offline-Tests für Adapter, Upload, Popup und Gesamtsteuerung |

Berechtigungen `storage` und `activeTab`. Hostrechte für beide AutoScout24- und
beide Kleinanzeigen-HTTPS-Hosts. `Bilder/*.jpg` ist für diese vier Hosts als
`web_accessible_resources` freigegeben. Kleinanzeigen-Content-Scripts bei
`document_idle`: `platforms.js`, `profile.js`, `automation.js`, `kleinanzeigen.js`,
`kleinanzeigen-content.js`. Kein Build und keine npm-Pakete zur Laufzeit nötig.
Der Filter für gesponserte Inhalte und mit LeasingMarkt.de-Logo gekennzeichnete
Angebote wird ausschließlich auf AutoScout24 injiziert. Er blendet dort auch
Contentbanner-Container samt reservierter Mindesthöhe und den leeren
Umfrage-Platzhalter aus. Diese Regeln werden gemeinsam
über die standardmäßig aktivierte Popup-Einstellung **Gesponserte Inhalte und
LeasingMarkt.de ausblenden** (`chrome.storage.local.hideSponsored`) gesteuert.

## 4. Allgemeine Interaktionsregeln

- IDs mit Punkten über `[id="autos.km"]` oder `getElementById` adressieren;
  `#autos.km` würde ID und Klasse verwechseln.
- Vor Aktionen aktuellen Ablaufstatus/ID prüfen. Nur der gebundene Tab beim
  richtigen Anbieter darf Aktionen ausführen und Status schreiben.
- Inputs/Textareas mit dem nativen `value`-Setter bearbeiten, danach `input`
  und `change` mit `bubbles:true`. Textareas behalten Absatzumbrüche.
- Comboboxen sind Buttons. Den Wert aus der durch `aria-labelledby` referenzierten
  `*-selected-option` lesen; Zusatzlabel „Preistyp*“ nicht als Preisart behandeln.
- Sollwert fehlt: Combobox öffnen, Listbox per `aria-controls`/`aria-owns` oder
  genau eine sichtbare `role=listbox` bestimmen, exakt passenden `role=option`-
  Text oder dokumentierten Alias anklicken. Übernommenen Text und geschlossene
  Liste prüfen. Versteckte Enum-Inputs nicht direkt setzen.
- Radios/Checkboxen nur bei abweichendem Sollzustand über ihre Labels klicken.
- Polling 200 ms; Controls üblicherweise 20 s, Kategorie/Seitenwechsel 30 s,
  Uploads 120 s. Sichtbare `aria-invalid=true` und native Validität prüfen.
- Fehlende Angaben und Zeichenlimitüberschreitungen konkret melden. Keine
  erfundenen Pflichtdaten und keine stille Textkürzung.

## 5. Schritt 0 – Bilder und Titel

**URL:** `https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html`
**Erkennung:** `#ad-title`, solange `[id="autos.km"]` noch nicht existiert.

Dateireihenfolge identisch zu AutoScout24:

1. `Ford Fiesta.jpg`
2. `Front.jpg`
3. `Heck.jpg`
4. `hinten rechts.jpg`
5. `links.jpg`
6. `rechts.jpg`
7. `Vorne rechts.jpg`
8. `Specs.jpg`
9. `Mängel.jpg`

`input[type=file][multiple]` suchen (Snapshot: ohne ID, verborgene `hidden`-Klasse).
JPEGs per Extension-URL laden, `File`-Objekte in `DataTransfer` erzeugen, dessen
`files` auf das Input setzen und ein `change`-Event auslösen.

Upload erst als fertig behandeln, wenn für 600 ms durchgehend:

- mindestens neun `button[aria-label="Bild entfernen"]` existieren,
- mindestens neun eindeutige Server-URLs in
  `input[name^="adImages["][name$="].url"]` vorliegen; ausschließlich nicht leere
  `https://img.kleinanzeigen.de/...`-URLs zählen, keine Blob-URLs,
- keine sichtbaren `aria-busy=true`, `role=progressbar`, `.animate-spin`,
  `[data-title="spinner"]` oder `[data-title="loading"]`-Indikatoren existieren.

Dann `images=uploaded` speichern. Fortschritt „Kleinanzeigen-Bilder: X/9 fertig
hochgeladen …“ anzeigen. Bei vorhandenen Karten oder bereits gespeichertem
Uploadstatus erneut auf Abschluss prüfen, nicht die Dateien nochmals übergeben.
Bei Teil-Uploads/Timeouts unterbrechen. Kein automatischer Ohne-Bilder-Fallback
für Kleinanzeigen.

Danach `#ad-title` / `name=title` auf
**Ford Fiesta Vignale 1,0 l EcoBoost Automatik - Top Ausstattung** setzen (62 von
maximal 65 Zeichen). Dieser Anbieter-Titel ist als `listingTitle` in
`kleinanzeigen.js` konfiguriert und ersetzt die frühere Ableitung aus der
Modellvariante. Der doppelte Modellname im Snapshot von Schritt 1 ist kein
verbindlicher Titel. Nach der
Titeleingabe werden Kategorie-Vorschläge erwartet.

## 6. Schritt 1 – Kategorie

1. Sichtbares `label[for="ad-category-picker-216"]` suchen.
2. Prüfen, dass es **Auto, Rad & Boot › Autos › Ford › Fiesta** enthält.
3. Label anklicken, nicht 223 (Autoteile) oder 280 (Dienstleistungen).
4. Auf `input[name=categoryId].value === "216"` und `[id="autos.km"]` warten.
5. Bereits bestätigte Kategorie 216 mit Fahrzeugfeldern erhalten.

Quelle: `kleinanzeigen.de_sell_car_form_kategorie.html`. Ein eigenständiger
Fragmentzustand ist ebenfalls erkennbar; live verbleibt das Anfangsformular
üblicherweise dahinter. Marke Ford und Modell Fiesta sind nach Auswahl im
Snapshot bereits vorbelegt.

## 7. Schritt 2 – Weitere Daten

**URL:** weiterhin die Aufgeben-Seite. **Quelle:** `page_1.html`.
**Erkennung:** `[id="autos.km"]`. Nach Kategorie-Render Titel erneut prüfen.

| ID | Wert / Alternativen |
| --- | --- |
| `ad-title` | Ford Fiesta Vignale 1,0 l EcoBoost Automatik - Top Ausstattung |
| `autos.marke` | Ford |
| `autos.model` | Fiesta |
| `autos.km` | 32500, ggf. Anzeigeformat 32.500 |
| `autos.schaden` | Unbeschädigtes Fahrzeug; Unbeschädigt / Unbeschädigtes Fahrzeug (unfallfrei), gemäß AS24 damaged=false und accident=false |
| `autos.ezm` | Juni, alternativ 06 oder 6 |
| `autos.ez` | 2020 |
| `autos.fuel` | Benzin |
| `autos.power` | 101 PS, nicht 74 kW |
| `autos.shift` | Automatik |
| `autos.typ` | Kleinwagen |
| `autos.anzahl_tueren` | 5; alternativ 4/5, 4/5 Türen oder 5 Türen |
| `autos.tuevm` | Juli, alternativ 07 oder 7 |
| `autos.tuevy` | 2027 |
| `autos.umweltplakette` | 4 (Grün); alternativ Grün / 4 - Grün |
| `autos.schadstoffklasse` | Euro 6d-TEMP; alternativ gröbere Klasse Euro 6 / Euro6; keine automatische Ergänzung der Beschreibung |
| `autos.aussenfarbe` | Blau |
| `autos.material_innenausstattung` | Vollleder, alternativ Leder |
| `ad-price-amount` | 14500, ggf. Anzeigeformat 14.500 |
| `ad-price-type` | Festpreis; bei künftigem `priceNegotiable=true` VB |
| `ad-zip-code` | 81925 |
| `ad-city` | Website-Ortswert München / München - Bogenhausen, schreibgeschützt |
| `ad-name` | Vorhandener Name im angemeldeten Profil; Snapshot Alexander Schwartz |

### Ausstattung / Checkboxen

Zuerst Auswahlfelder und kurze Eingaben bearbeiten, danach sämtliche
Ausstattungs-Checkboxen setzen und erst anschließend die Beschreibung eintragen.
Ein Beschreibungsfehler darf die vorherige Checkbox-Bearbeitung nicht verhindern.

| Checkbox-ID | Sollzustand / Quelle |
| --- | --- |
| `ad-type-OFFER` | true: Ich biete |
| `autos.trailer_coupling` | false: AS24 Equipment 20 nicht markiert |
| `autos.park_assistant` | true: Equipment 128/129/130/131 |
| `autos.alluminium_rims` | true: Equipment 15; Website-ID-Schreibweise beachten |
| `autos.xenon_led_light` | true: Equipment 140 (alternativ 39) |
| `autos.air_conditioning` | true: Equipment 5/30 |
| `autos.navi` | true: Equipment 23 |
| `autos.radio_tuner` | true: Equipment 10/138 |
| `autos.bluetooth` | true: Equipment 122 |
| `autos.handsfree_speaker` | true: Equipment 124 |
| `autos.sunroof` | false: Equipment 4/50 nicht markiert |
| `autos.seat_heating` | true: Equipment 34 |
| `autos.speed_control` | true: Equipment 38/133 |
| `autos.non_smoking` | true: AS24 nonSmoking |
| `autos.abs` | true: Equipment 1 |
| `autos.full_service_history` | true: AS24 fullServiceHistory |

`ad-address-visibility`, optionale Straße und `ad-marketing-consent` erhalten:
bestehende Profileinstellungen, keine Fahrzeugdaten. Im Snapshot sind Adresse
und Marketing-Opt-in nicht markiert; die Straße „Normannenstr.“ ist im deaktivierten
Feld vorhanden. Standort erst akzeptieren, wenn die PLZ passt, ein München-Ort
vorliegt und `input[name=locationId]` nicht leer ist. Gegebenenfalls den sichtbaren
Ortsvorschlag München - Bogenhausen anklicken. Kontoname darf nicht leer sein.

### Beschreibung

`#ad-description`, maximal 4.000 Zeichen. Vollständiges AS24-Beschreibungs-HTML
inert parsen; Absätze/Überschriften als Umbrüche, Listenpunkte mit `- ` und
Trennlinien als Absatzabstand ausgeben. Fettformatierung fällt weg, Text bleibt
erhalten. **Ausschließlich den Vorlagentext verwenden.** Keine Kontaktzeile,
Rufnummer, Schadstoffklasse oder andere Informationen automatisch anhängen.
Länge prüfen, nie still kürzen. Die vorhandene Vorlage passt unter 4.000 Zeichen.

Textarea-Eingabe separat von kurzen Inputs behandeln: nativen Setter mit
Eingabeevents verwenden und 300 ms auf den kontrollierten Formularzustand warten,
danach bis zu 2 s auf bestätigten vollständigen Wortlaut und einen nicht leeren
Formularzustand warten, bevor das aktuelle, gegebenenfalls neu gerenderte Feld
verlassen wird. Danach
erneut 300 ms warten und den frischen DOM prüfen. Der vorhandene `data-empty`-
Marker darf nicht mehr `true` sein; ein bloß sichtbarer, aber nicht vom Formular
übernommener DOM-Wert reicht nicht.

Den vollständigen Wortlaut Unicode-normalisiert und mit vereinheitlichten
Leerzeichen/Zeilenumbrüchen vergleichen. Normale Textarea-/Website-Normalisierung
darf keinen Fehlalarm auslösen, fehlende oder abgeschnittene Inhalte schon.
Kleinanzeigen kann dekorative Überschriftensymbole entfernen: Bei der Prüfung
`⭐` (mit optionalem Variationsselektor) unmittelbar vor „Highlights“ und `🔎`
unmittelbar vor „Bekannte Mängel“ ignorieren. Der Wegfall von `🔎` bedeutet in
JavaScript zwei Zeichen weniger und darf bei ansonsten identischem vollständigem
Text keine Fehlermeldung auslösen. Andere Zeichen und der gesamte Wortlaut,
insbesondere die Mängelangaben, bleiben verpflichtend. Die Zeichenanzahl allein
ist kein Erfolgskriterium.
Bei Fehlschlag höchstens einen weiteren Versuch ausführen, gegebenenfalls über
den nativen Bearbeitungsbefehl `insertText` in der fokussierten Textarea. Dieser
Klartextweg betrifft nur Kleinanzeigen, nicht den Rich-Text-Editor von AutoScout24.
Bleibt die Übernahme erfolglos, eine verständliche Meldung mit Soll-/Ist-Zeichenanzahl
anzeigen, statt „Nicht verfügbar: Übernahme von ad-description“.

Nach der abschließenden Upload-Wartezeit und **vor Nächster Schritt** Checkboxen
und vollständige Beschreibung erneut am aktuellen DOM prüfen. Zurückgesetzte
Werte reparieren oder konkret unterbrechen. Erst dann `fields` als erledigt
speichern und das Formular absenden.

Die Aufnahmen enthalten kein Telefonnummernfeld, nur einen Telefon-Hilfelink.
Auf Nutzerwunsch keine Rufnummer in der Beschreibung ergänzen. Die zuvor von der
Extension angehängten Zeilen „Kontakt: …“ und „Schadstoffklasse: …“ werden beim
erneuten Ausfüllen durch den reinen Vorlagentext ersetzt, nicht beibehalten.
Die bekannten Mängel – Kratzer hinten rechts und kleines Loch im Beifahrersitz –
vollständig erhalten. Der strukturierte Zustand folgt der AutoScout24-Einstufung;
die kosmetischen Mängel bleiben ausdrücklich im Beschreibungstext genannt.

### Nächster Schritt

1. Gemappte Felder ausfüllen, Kontoname/Standort und Validität prüfen.
2. Upload-Abschluss erneut prüfen.
3. Aktivierten Button mit exakt **Nächster Schritt** suchen. Nicht Vorschau,
   Entwurf speichern oder den Anfangsformular-Button „Anzeige aufgeben“ verwenden.
4. Vor dem Klick `formSubmitted=true` speichern, dann klicken.
5. Bei unmittelbar sichtbaren Validierungsfehlern Flag zurücksetzen und unterbrechen.
   Sonst auf die Paket-Auswahl warten.

## 8. Schritt 3 – Basis Paket und Anzeige aufgeben

**URL-Muster:** `/p-anzeigentypauswahl/<Kategorie>/<Anzeigen-ID>/<UUID>`.
Keine Beispiel-ID fest verdrahten, keine URL selbst konstruieren; Website navigiert
durch den „Nächster Schritt“-Klick. **Erkennung:** `button[role=radio]` mit **Basis Paket**.

1. Auf die interaktive Astro-/React-Paket-Auswahl warten. Solange der zugehörige
   `astro-island[component-export="BundleSelection"]` das Attribut `ssr` trägt,
   nicht klicken. `await-children` allein ist kein Nachweis fehlender Hydrierung.
2. Falls noch nicht markiert, den Radio-**Button** „Basis Paket“ anklicken, nicht
   die bloße Kartenfläche. Vor einem Klick auf einen neuen DOM-Button 500 ms
   stabilen Bestand abwarten. Ein vor Hydrierung verlorener Klick darf auf dem
   aktuellen, gegebenenfalls ersetzten Button wiederholt werden: höchstens drei
   Auswahlklicks mit mindestens 800 ms Abstand. Bereits bestätigte Auswahl nicht
   erneut anklicken. Bis zu 30 s auf Bestätigung warten.
3. `aria-checked=true` am Basis-Button prüfen und sicherstellen, dass kein anderes
   Radio im Paket-Radiogroup zugleich ausgewählt ist. Plus nie auswählen.
4. Basis-Kartencontainer muss „Kostenlos“ enthalten.
5. Auf aktivierten Button mit exakt **Anzeige aufgeben** warten.
6. Vor dem Klick `publishClicked=true` und Schritt 3 speichern. Anschließend
   Radiozustand und den **aktuellen** Submit-Button erneut prüfen. Wenn sich die
   Auswahl vor dem tatsächlichen Klick geändert hat, Checkpoint zurücksetzen und
   unterbrechen, damit Fortsetzen weiterhin möglich ist.
7. Einmal anklicken; sichtbare Fehlermeldungen konkret melden.
8. Bei ausdrücklicher Erfolgsmeldung `done`, andernfalls `submitted` mit Hinweis
   auf die Anzeigenübersicht. Klick/Weiterleitung allein bestätigt keine Freischaltung.

Der neuere vom Nutzer gelieferte DOM beginnt mit **beiden Radios false** und
einem `aria-disabled=true`-Button **Weiter**. Dieser ist kein zusätzlicher
kostenloser Abschlussschritt und wird nicht blind angeklickt. Die read-only
geprüfte öffentliche Komponente
`/frontend-web/_re-sellerverse-web/assets/BundleSelection.DRXeIX-l.js` bestätigt:
Der Basis-Radio-Button besitzt `onClick`, setzt die ausgewählte Paket-ID und
ändert bei kostenlosem Paket den finalen Button von **Weiter** zu **Anzeige
aufgeben**. Die `preselected`-Option in den Astro-Props bezeichnet die
Zahlungsintervalloption, nicht eine bereits bestätigte Paket-Auswahl.

Bei anhaltend fehlender Bestätigung konkret zwischen noch ladender Komponente
und nicht übernommener Basis-Auswahl unterscheiden. Vor bestätigter Auswahl bleibt
`publishClicked=false`. Die öffentliche JS-Quellenprüfung ersetzt keinen Live-
Browser-Test; die Regressionstests simulieren späte Hydrierung, ersetzte Buttons,
Labelwechsel und eine Auswahländerung vor dem finalen Klick.

Nach Dokumentwechsel Paket-Seite direkt erkennen; Formular/Uploads nicht wiederholen.
Nach finalem Veröffentlichungsklick kein automatischer zweiter Klick und kein Resume.

## 9. Zustand und Wiederaufnahme

Gemeinsamer historischer Key `chrome.storage.local.autoscout24Run`:

```js
{
  id: "UUID", tabId: 123, platform: "kleinanzeigen",
  status: "running", // running | stopped | error | submitted | done
  step: 0,          // 0 bis 3
  message: "…", completed: [], // images, title, category, fields
  images: "pending",          // pending | uploaded
  formSubmitted: false,       // Nächster Schritt bereits angeklickt
  publishClicked: false,      // final: Anzeige aufgeben bereits angeklickt
  freeContinueClicked: false, // nur AutoScout24, hier nicht verwendet
  updatedAt: 0
}
```

Nachrichten: `GET_RUN`, `GET_RUN_FOR_TAB`, `GET_TEMPLATE`, `START`, `STOP`, `RESUME`,
`UPDATE`. Worker serialisiert Änderungen und prüft Sender-Tab-ID, Ablauf-ID,
Status und Anbieter-Host. Alte Zustände ohne `platform` gelten weiterhin als
AutoScout24. Content Scripts bearbeiten nur ihren jeweiligen Anbieter.

Storage-Änderungen und 1,5-s-Polling wecken die Steuerung; höchstens eine Bearbeitung
pro Dokument. Beim Fortsetzen vorhandene Werte erhalten, Uploadabschluss prüfen
und Dateien nicht doppelt senden. Bei `formSubmitted=true` auf die schon
angeforderte Paket-Seite warten, nicht erneut submitten. Falls die Website die
Aktion nicht abgeschlossen hat, konkret melden. Nach `publishClicked=true` nur
Ergebnis prüfen, nie erneut veröffentlichen. Bei Schließen des Tabs stoppen.

Nach finalem Kleinanzeigen-Klick und Weiterleitung speichert der Worker Schritt 3 /
`submitted`, nicht AutoScout24-Schritt 6. Popup zeigt Anbieter und dessen Schrittanzahl.
Fortsetzen verlangt denselben Tab beim selben Anbieter.

## 10. Offline-Prüfung und Playwright-Vorlage

```sh
npm install
npm run check
npm test
```

Offline-Tests prüfen Encoding/Snapshots, gemeinsame Daten, Beschreibung/Mängel,
Kategorie, Comboboxen/Aliase, Ausstattung, Kontonamen, Dateireihenfolge, bestätigte
Bild-URLs und Spinner-Barriere, Basis statt Plus, Submit-Checkpoints, Anbieter-/
Tabbindung, Popup und vollständigen simulierten Ablauf. Website-Reaktionen werden
in jsdom nachgebildet. Dies ersetzt keinen Live-Browser-Test; dieser steht noch aus.

Playwright-Testentwurf:

1. Chromium mit temporärem persistentem Profil und unpacked Extension starten.
2. Website-Routen offline abfangen, Windows-1252-Fragmente korrekt dekodieren,
   Seitenscripts entfernen und minimale simulierte Formularlogik hinzufügen.
3. AutoScout24- und Kleinanzeigen-Tab öffnen. Popup im Kleinanzeigen-Tab starten;
   nur der zugewiesene Tab darf zur passenden Einstiegs-URL navigieren.
4. Neun Dateien in definierter Reihenfolge prüfen. Erst Vorschaubuttons/Blob-URLs
   mit Spinnern erzeugen: noch kein Fortschreiten zu Kategorie/Daten. Dann echte
   Server-URL-Inputs vervollständigen und Spinner entfernen.
5. Nach Titel das Kategorienfragment einblenden; Radio 216 prüfen. Danach `page_1`
   rendern; auf 14.500 €, 32.500 km, 101 PS, EZ 06/2020, HU 07/2027 und alle Werte
   aus Abschnitt 7 prüfen. Vollständige Beschreibung inklusive Mängeln prüfen.
6. Nach „Nächster Schritt“ auf dynamische Paket-URL navigieren; Checkpoint muss
   vor Klick vorliegen. Paket-Seite zusätzlich per vollständigem Reload testen.
7. Plus zunächst markieren; Extension muss Basis wählen. Checkpoint vor finalem
   Klick prüfen, Erfolgsmeldung und unbestätigte Weiterleitung getrennt testen.
8. Stop während Upload, fehlenden Kontonamen, falsche Kategorie, unbekannte
   Pflichtangaben und Mehrfachklick/Reload prüfen.

Live zusätzlich Login/Telefonverifizierung, tatsächliche Optionen/Leistungseinheit,
Upload-Rendering, Ortsübernahme, Profil- und Checkboxwerte und bestätigte
Veröffentlichung prüfen. Der finale Live-Klick erstellt tatsächlich eine Anzeige.
