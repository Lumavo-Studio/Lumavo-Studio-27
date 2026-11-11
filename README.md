# Lumavo Studio 27

Videostudio für Einsteiger: Schneiden, Titel, Übergänge, Filter, Bewegung, Farbe, Ton mit Mixer und Export in freier Wahl.

## Installation

**Windows:** `BAUEN.bat` doppelklicken. Das Skript fragt nach System (64-Bit oder 32-Bit) und Art (Installer, Portable oder beides), lädt bei Bedarf selbst Node.js und baut die Dateien in den Ordner `dist`.

**macOS:** `BAUEN-mac.command` öffnen (Rechtsklick, Öffnen). Es fragt nach Apple Silicon oder Intel. Node.js muss dort installiert sein.

**Cloud:** Der Workflow `Installer bauen` (GitHub, Reiter „Actions“) baut für Windows, macOS und Linux.

## Projektordner

Beim ersten Start entsteht `Dokumente/Lumavo Studio 27` mit den Unterordnern `Projekte`, `Exporte`, `Proxys` und `Autosave`.

## Projekt importieren und Beispielprojekt

„Projekt importieren“ legt aus einem Ordner mit Videos, Bildern und Audio ein Projekt an (Unterordner werden mitgelesen). Liegt eine CSV-Logdatei mit den Spalten `File Name`, `Comments`, `Shot`, `Scene` im Ordner, nutzt Lumavo sie für Namen und Reihenfolge. Das Beispielprojekt (Flug-Trailer) entsteht so aus dem entpackten Ordner `Editing` der Datei `Lumavo-Video.zip`. Die Mediendateien liegen nicht im Installationspaket.

## Regeln und Lizenz

Beim ersten Start zeigt die App ein Regelwerk. Lizenz: CC BY-ND 4.0, siehe `LICENSE`.

## Erweiterungen

JSON-Dateien im Erweiterungsordner (Hauptmenü, Erweiterungsordner öffnen) liefern Filter und Export-Formate. Beispiele: `extensions/`. Nur vertrauenswürdige Erweiterungen nutzen.
