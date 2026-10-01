# Projektregeln

- `spec-autoscout24.md` ist die verbindliche technische Ablaufbeschreibung.
  Bei jeder Änderung am AutoScout24-Ablauf, an Selektoren, Fahrzeugdaten,
  Einstellungen oder Zustandsübergängen die Spezifikation im selben Arbeitsschritt
  aktualisieren. Veraltete Aussagen ersetzen, nicht nur neue Hinweise anhängen.
- DOM-Snapshots und Windows-Verknüpfungen können auf unterschiedliche oder
  nachträglich geänderte Inhalte zeigen. Dateiname und tatsächlichen Inhalt
  prüfen und diese Zuordnung in der Spezifikation korrekt dokumentieren.
- Relevante Änderungen mit `npm run check` und `npm test` prüfen. Offline-Tests
  und tatsächliche Live-Browser-Prüfungen in der Dokumentation unterscheiden.
