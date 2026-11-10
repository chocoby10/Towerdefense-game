# Inselwächter

Tower-Defense-Spiel für Browser und Android (HTML5 Canvas + TypeScript, mit Vite gebaut und mit Capacitor als Android-App verpackt).
Das Spielprinzip lehnt sich an klassische Browser-Tower-Defense-Spiele an. Grafik, Namen, Level und Sounds sind eigenständig: Grafiken werden per Code gezeichnet, Sounds per Web Audio erzeugt. Es gibt also keine fremden Assets und keine Lizenzfragen.

## Spielen (lokal)

Voraussetzung: Node.js ≥ 20

```bash
npm install
npm run dev        # Dev-Server, URL steht in der Konsole (auch im WLAN fürs Handy erreichbar)
```

Produktions-Build testen:

```bash
npm run build
npm run preview
```

## Online spielen (GitHub Pages)

Jeder Push auf `main` baut das Spiel und veröffentlicht es unter
**https://chocoby10.github.io/Towerdefense-game/** (Workflow: `.github/workflows/deploy-pages.yml`).

Einmalig nötig: im Repo unter *Settings → Pages → Build and deployment → Source* „GitHub Actions“ auswählen.

Auf dem Handy: Seite öffnen, im Browser-Menü „Zum Startbildschirm hinzufügen“ – dann startet das Spiel wie eine App im Vollbild.

## Inhalt

- 5 Inseln (Level) mit 10–20 Wellen, Freischaltung nacheinander
- Schwierigkeitsgrade Leicht/Normal/Schwer, je 1–3 Sterne (max. 45 Sterne)
- Endlosmodus pro Insel mit Rekord (alle 10 Wellen ein Kraken)
- Sterne-Shop mit dauerhaften Boni (Startkapital, Schaden, Reichweite, Abklingzeit, Leben, Verkaufswert)
- 5 Türme mit je 3 Stufen: Schleuder, Muschelhorn (verlangsamt), Speer-Totem (durchschlägt Panzer), Feuerschale (Fläche + Brand), Sturmstein (Kettenblitz)
- Spezialisierung auf Stufe 3: pro Turm zwei Zweige (z. B. Doppelschleuder oder Felsbrocken, Speerhagel oder Riesenspeer)
- Aktive Fähigkeiten mit Abklingzeit: Vulkanbrocken (Flächenschaden an gewählter Stelle) und Flutwelle (spült Bodengegner zurück)
- Kombo-Bonus für schnelle Mehrfach-Kills, Bildschirmwackeln, Betäubungs- und Treffereffekte
- 7 Gegnertypen: Krabbe, Gecko, Pirat, Möwe (fliegt), Panzerschildkröte, Seeschamane (heilt), Kraken (Boss)
- Zielwahl pro Turm, Verbessern/Verkaufen, Wellenvorschau, Früh-Bonus, 1×/2×/3×-Tempo, Pause
- Touch-Bedienung (Tippen = Vorschau, nochmal tippen = bauen), Maus und Tastatur
- Pausiert automatisch, wenn die App in den Hintergrund geht
- Fortschritt und Einstellungen werden lokal gespeichert

Vollbild: Auf Handys wechselt das Spiel beim Tippen auf „Spielen“ automatisch in den Vollbildmodus; zusätzlich gibt es den ⛶-Knopf oben rechts (nicht auf iPhones – dort „Zum Home-Bildschirm“ nutzen).

Tastatur: `1`–`5` Turm · `Q`/`E` Fähigkeiten · `Leertaste` Welle · `P` Pause · `F` Tempo · `U` Verbessern · `S` Verkaufen · `Esc` Abbrechen · `Shift`+Klick baut mehrere Türme hintereinander

## Balance-Test

```bash
npm run sim
```

Ein einfacher Bot spielt jede Insel mit drei Spielstärken durch. Varianten: `npm run sim -- leicht`, `-- schwer`, `-- endless`. Werte anpassen in `src/game/data.ts` (Türme, Gegner, Level) und `src/game/waves.ts` (Wellen).

## Projektstruktur

```
src/main.ts            UI, Menüs, Eingabe, Hauptschleife
src/style.css          Layout (responsiv, Querformat)
src/game/data.ts       Türme, Gegner, Level
src/game/waves.ts      Wellengenerator
src/game/game.ts       Spiellogik (ohne DOM, deshalb headless testbar)
src/game/renderer.ts   Canvas-Grafik
src/game/audio.ts      synthetische Soundeffekte und Musik
src/game/storage.ts    Speicherstand
capacitor.config.ts    Android-Konfiguration
```

## Android / Google Play

Zusätzlich nötig: [Android Studio](https://developer.android.com/studio) (enthält das Android SDK und ein JDK).

1. In `capacitor.config.ts` die `appId` auf eine eigene Kennung setzen (z. B. `de.deinname.inselwaechter`). Sie lässt sich nach dem ersten Play-Store-Upload nicht mehr ändern.
2. Android-Projekt erzeugen (nur einmal):
   ```bash
   npm run build
   npm run android:add
   ```
3. In `android/app/src/main/AndroidManifest.xml` beim `<activity>`-Element `android:screenOrientation="sensorLandscape"` ergänzen.
4. Nach jeder Änderung am Spiel: `npm run android:sync`, danach `npm run android:open`. In Android Studio auf dem Emulator oder Handy testen.
5. Für den Play Store: in Android Studio *Build → Generate Signed App Bundle* wählen, einen Upload-Schlüssel anlegen (gut sichern!) und die `.aab` in der [Play Console](https://play.google.com/console) hochladen.

Vor der Veröffentlichung noch zu erledigen:
- App-Icon und Splashscreen in PNG-Größen erzeugen, z. B. mit `@capacitor/assets`. Als Vorlage dient `public/icon.svg`.
- Eine Datenschutzerklärung ist für jeden Play-Store-Eintrag Pflicht. Das Spiel selbst sammelt keine Daten; Werbung oder Analytics würden das ändern.
- Ausfüllen in der Play Console: Store-Eintrag, Screenshots, Inhaltsbewertung (IARC) und das Formular zur Datensicherheit.
- Neue private Entwicklerkonten müssen vor der Freigabe einen geschlossenen Test mit Testern durchlaufen. Die aktuellen Regeln stehen in der Play-Console-Hilfe.
