# PROTOTYPE: Final Cut Pro Lab

> **Stand 11.11.2026: auf Eis.** Wir bauen vorerst kein Final-Cut-Plugin. Das Lab bleibt als Referenz auf diesem Branch, die Ergebnisse stehen unten.

Wegwerf-Code. Er soll klären, welcher Weg für ein PostPin-Plugin in Final Cut Pro taugt. Nichts davon geht so in Produktion; validierte Entscheidungen werden in den echten Code übernommen, das Lab kommt danach auf einen Prototyp-Branch.

Eine macOS-App (`PostPin FCP Lab`) mit eingebetteter Workflow Extension (`PostPin Lab`). Beide zeigen dieselben Tabs, die Extension zusätzlich die Live-Timeline. Jeder Austausch mit FCP landet im **Log**-Tab (Button „Kopieren“).

```bash
./run.sh                                # SDK bereits in vendor/ oder in /Library/Developer/SDKs
./run.sh ~/Downloads/Workflow_Extensions_1.0.3.dmg   # sonst: SDK-Image von developer.apple.com
```

Das Skript entpackt das Workflow-Extensions-SDK nach `vendor/` (ohne Installer, prüft Apples Signatur), erzeugt das Xcode-Projekt mit xcodegen, baut, kopiert nach `~/Applications` und registriert die Extension. Signiert wird mit der ersten „Apple Development“-Identität; eine andere über `FCP_LAB_SIGN_IDENTITY=<hash>`.

In Final Cut: **Fenster › Erweiterungen › PostPin Lab** (oder die Erweiterungen-Taste in der Werkzeugleiste).

## Die Wege

| # | Weg | Wo | Was es zeigen soll |
|---|---|---|---|
| 0 | **Live-Timeline** (`FCPXTimeline`) | Extension, Tab 0 | Sequenzname, Start, Frame-Dauer, Projekt-UID, Event, Library-URL live; Playhead-Updates; ▶︎ springt mit `movePlayhead` |
| 1 | **Drag FCP → PostPin** | Tab 1 | Projekt reinziehen → Marker, Struktur, UID, Pasteboard-Typen |
| 2A | **Marker-Clip** | Tab 2 | leerer Clip mit Kommentaren als Marker, per Drag in die Timeline oder per Apple Event ins Event |
| 2B | **Projekt-Kopie mit Markern** | Tab 2 | gezogenes Projekt + Marker auf den Primary-Storyline-Clips, re-importiert (Drag in den Browser oder Apple Event) |
| 3 | **Share Destination** | nur App, Tab 3 | *Teilen › PostPin Lab* → FCP rendert ohne Sichern-Dialog in unseren Ordner und schickt Film + FCPXML |
| – | **WebView** | Tab „WebView“ | läuft ein `WKWebView` im Extension-Panel (Sandbox, Netzwerk)? JS ↔ Swift-Bridge steuert den Playhead |

## Testprotokoll

Bitte notieren, was passiert (Log kopieren hilft am meisten).

**0 · Live**
- [ ] Panel öffnet sich, Host-Zeile zeigt FCP-Version und Bundle-ID (`com.apple.FinalCut` oder `com.apple.FinalCutApp`)
- [ ] Projekt-UID und Library-URL kommen an (sie wären der stabile `getProjectId`)
- [ ] Playhead-Zähler läuft beim Abspielen mit; wie flüssig ist das?
- [ ] ▶︎ neben einem Kommentar springt in FCP an die Stelle
- [ ] „+ am Playhead“ legt einen Kommentar an der aktuellen Position an

**1 · Rein**
- [ ] Projekt aus dem Browser ins Panel ziehen: welche Pasteboard-Typen bietet FCP an (aufklappen)?
- [ ] Eine Auswahl aus der Timeline ziehen: Projekt oder nur Clips?
- [ ] Stimmen die Marker-Zeiten (Timecode in FCP vergleichen), auch bei Markern auf verbundenen Clips?
- [ ] Gleicher Test im App-Fenster statt in der Extension

**2A · Marker-Clip**
- [ ] Drag-Griff an den Anfang der Timeline über die Primary Storyline ziehen: landet er als verbundener Clip, stimmen die Marker?
- [ ] „Per Apple Event importieren“: neuer Clip im Event? Fragt FCP nach?
- [ ] Marker-Farben: To-do rot, Erledigt grün, Kapitel orange?

**2B · Projekt-Kopie** (erst ein Projekt in Tab 1 ziehen)
- [ ] Standard („… (PostPin)“, neue UID, Event aus der Live-Timeline): Kopie im richtigen Event und in der richtigen Library?
- [ ] **Namen + UID behalten**: bietet FCP „Ersetzen“ an? Wenn ja: sind danach alle Schnitte, Effekte und Audio im Original noch intakt? Das wäre echtes `setMarkers`.
- [ ] Drag in den Browser statt Apple Event: Unterschied?
- [ ] Welche FCPXML-Version nimmt FCP an (Picker)?

**3 · Share Destination** (Einrichtung steht im Tab)
- [ ] Teilen startet ohne Sichern-Dialog, im Log erscheinen `make`, `get locn/meta/dopt`
- [ ] Nach dem Rendern: `open` mit `.mov` und `.fcpxml`, das XML erscheint in Tab 1
- [ ] Fragt FCP nach `lbry` (Library)? Was passiert mit „library: has archive“?
- [ ] Wird die Destination nach einem FCP-Neustart vergessen (bekannter FCP-Bug)? Export als `.fcpxdest` möglich?

**WebView**
- [ ] Bridge-Demo: Klick auf einen Kommentar springt in FCP, Playhead tickt in der Seite mit
- [ ] Eine echte URL laden (z. B. `http://localhost:5173` mit der plugin-core-UI): lädt sie, gehen Fonts/CSS?

## Ergebnisse (FCP 12.4 Creator Studio, 11.11.2026)

- **0 Live:** geht. Projekt-UID, Event, Library-URL kommen an, `movePlayhead` springt. Marker lesen/schreiben kann die API nicht.
- **1 Rein:** Projekt-Drag liefert FCPXML 1.14 mit UID und Markern, aber ohne Event.
- **2 Raus per Apple Event:** geht. A wird ein Compound Clip im Event; B mit Name + UID behalten bietet „Ersetzen“ an und ersetzt das Projekt.
- **2 Raus per Drag:** aus dem App-Fenster nimmt FCP Marker-Clip und Projekt-Kopie an (die Kopie nur mit derselben FCPXML-Version wie die Quelle, sonst still abgelehnt). Aus dem Extension-Panel nimmt FCP nichts an, in keiner Variante (Daten, Datei-URL), obwohl es die Daten anfordert. Über der Timeline: Verbots-Cursor.
- **3 Share Destination:** geht ohne Sichern-Dialog. `make` → `get dopt/meta/locn/lbry` → Render → `open` mit `.mov` + `.fcpxml` (inkl. Event und UID). Menü heißt „Ablage › Teilen“.
- **WebView:** geht, JS ↔ Swift-Bridge steuert den Playhead.

## Bekannte Grenzen

- Ohne Final Cut auf dem Build-Mac getestet: der FCPXML-Code gegen die DTD 1.12 (Ausgabe valide, Marker-Roundtrip stimmt), das Share-Protokoll mit simulierten Apple Events nach Apples Guide. Ob FCP genau diese Descriptoren schickt, zeigt erst der echte Test.
- Die Share Destination beantwortet FCPs Events direkt mit `NSAppleEventManager` statt mit Cocoa Scripting wie Apples Beispiel. Kommt beim Teilen kein `make` im Log an, braucht FCP vermutlich ein sdef. Dann `OSAScriptingDefinition.sdef` aus Apples SimpleAssetManagerSample ergänzen.
- Die Extension greift laut SDK 1.0.3 nicht auf FCPX-Klassensymbole zu. Der Container (Projekt/Event/Library) wird über `objectType` und Selektoren gelesen.
- Marker auf verbundenen Clips und in Compound Clips setzt 2B nicht, nur auf der Primary Storyline.
