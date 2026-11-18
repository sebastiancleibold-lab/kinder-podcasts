# Hörhaus – Kinder-Podcasts

Eine einfache Web-App, mit der kleine Kinder ihre Lieblings-Podcasts selbst starten: Kind antippen, Bildkachel antippen, hören.

- Reine statische Web-App (HTML, CSS, JavaScript), kein Server, kein Konto.
- Podcasts und Folgen kommen aus dem öffentlichen Apple-Podcast-Verzeichnis (`itunes.apple.com`).
- Namen, Fotos, Favoriten und Hörstand liegen nur im Browser des Geräts (localStorage).
- Elternbereich: Zahnrad unten rechts 3 Sekunden halten, dann Rechenaufgabe lösen.

## Aufs iPhone

1. Seite in Safari öffnen.
2. Teilen › „Zum Home-Bildschirm“.
3. Optional: Einstellungen › Bedienungshilfen › Geführter Zugriff, damit das Kind in der App bleibt.

## Lokal starten

```
python3 -m http.server 8000
```
