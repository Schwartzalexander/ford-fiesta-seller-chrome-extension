# Projektregeln

- `spec-autoscout24.md` und `spec-kleinanzeigen.md` sind die verbindlichen
  technischen Ablaufbeschreibungen. Bei jeder Änderung am jeweiligen Ablauf,
  an Selektoren, Fahrzeugdaten, Einstellungen oder Zustandsübergängen die
  betroffene Spezifikation im selben Arbeitsschritt
  aktualisieren. Veraltete Aussagen ersetzen, nicht nur neue Hinweise anhängen.
  Gemeinsame Fahrzeugdaten und anbieterübergreifende Steuerung in beiden Specs
  aktuell halten.
- DOM-Snapshots und Windows-Verknüpfungen können auf unterschiedliche oder
  nachträglich geänderte Inhalte zeigen. Dateiname und tatsächlichen Inhalt
  prüfen und diese Zuordnung in der Spezifikation korrekt dokumentieren.
- Relevante Änderungen mit `npm run check` und `npm test` prüfen. Offline-Tests
  und tatsächliche Live-Browser-Prüfungen in der Dokumentation unterscheiden.
