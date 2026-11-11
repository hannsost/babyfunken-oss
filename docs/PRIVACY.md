# Datenschutzerklärung — Babyfunken

*Stand: 14. September 2026*

> Diese Fassung ist die Vorlage für die öffentlich gehostete
> Datenschutzerklärung. Vor Veröffentlichung sind die mit **⚠** markierten
> Stellen auszufüllen. Der Text beschreibt den Stand der App zum genannten
> Datum; wer Analytics, Crash-Reporting oder Konten ergänzt, muss ihn
> vorher anpassen. Er ersetzt keine Rechtsberatung.

## Verantwortlicher

⚠ Name, Anschrift, E-Mail-Adresse und ggf. Handelsregistereintrag des
Anbieters.

## Kurzfassung

Babyfunken überträgt Bild und Ton **direkt zwischen deinen eigenen
Geräten**. Diese Übertragung ist Ende-zu-Ende-verschlüsselt. Wir speichern
keine Videos, keine Audioaufnahmen, keine Standbilder und keine
Benutzerkonten. Es gibt keine Werbung, kein Tracking und keine
Analysewerkzeuge.

## Welche Daten verarbeitet werden

### Bild und Ton

Bleiben auf deinen Geräten. Die Übertragung läuft über WebRTC und ist
nach dem DTLS-SRTP-Standard verschlüsselt; eine unverschlüsselte
Übertragung ist technisch nicht vorgesehen. Unsere Server können diese
Daten nicht entschlüsseln und speichern sie zu keinem Zeitpunkt.

### Verbindungsdaten auf dem Signalserver

Damit sich zwei Geräte finden können, verarbeitet der Signalserver
vorübergehend im Arbeitsspeicher:

- eine zufällige Gruppenkennung,
- eine zufällige Gerätekennung je verbundenem Gerät,
- den von dir vergebenen Gerätenamen (z. B. „Handy Papa"),
- die gewählte Rolle (Kamera oder Monitor),
- die technischen Verbindungsdaten des WebRTC-Handshakes,
- die Information, dass ein Alarm ausgelöst wurde — nicht jedoch, wodurch.

Diese Daten liegen ausschließlich im Arbeitsspeicher und werden gelöscht,
sobald die Gruppe leer ist, spätestens 15 Minuten danach. Es findet keine
Speicherung auf Datenträgern statt.

Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO: die Verarbeitung ist zur
Erbringung der Funktion erforderlich, die du angefordert hast.

### IP-Adressen

Deine IP-Adresse ist für den Verbindungsaufbau technisch unvermeidbar.
Sie wird zur Missbrauchsabwehr (Begrenzung fehlgeschlagener
Beitrittsversuche) für maximal 15 Minuten im Arbeitsspeicher gehalten und
nicht dauerhaft protokolliert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f
DSGVO; das berechtigte Interesse ist der Schutz fremder Kameras vor
unbefugtem Zugriff.

### Relay-Server (TURN)

Wenn deine Geräte keine direkte Verbindung aufbauen können — etwa im
Mobilfunknetz — läuft die verschlüsselte Übertragung über unseren
Relay-Server. Dieser leitet die Daten weiter, ohne sie entschlüsseln zu
können, und speichert sie nicht.

### Daten auf deinem Gerät

Auf deinem Gerät speichert Babyfunken:

- den Gerätenamen, die Rolle und deine Einstellungen,
- den Kopplungsschlüssel und ein Gerätetoken deiner Gruppe.

Die beiden letztgenannten sind Zugangsdaten und liegen im
Android-Keystore. Gerätesicherungen sind für die App deaktiviert, damit
diese Schlüssel das Gerät nicht verlassen. Alles davon wird gelöscht,
wenn du in der App „Beenden" wählst oder die App deinstallierst.

## Berechtigungen

| Berechtigung | Wofür |
|---|---|
| Kamera | Bildübertragung vom Kamera-Gerät |
| Mikrofon | Tonübertragung, Gegensprechen und Schrei-Erkennung |
| Benachrichtigungen | Alarme und die Anzeige der laufenden Übertragung |
| Vordergrunddienst | Übertragung bei ausgeschaltetem Bildschirm |
| Netzwerkzugriff | Verbindungsaufbau zwischen den Geräten |

Die Schrei-Erkennung wertet ausschließlich die Lautstärke auf dem
Kamera-Gerät aus. Es wird nichts aufgezeichnet, nichts übertragen und
nichts analysiert, was über die Frage „ist es gerade anhaltend laut"
hinausgeht.

## Weitergabe an Dritte

Keine. Es sind keine Analyse-, Werbe- oder Crash-Reporting-Dienste
eingebunden. ⚠ Sofern die Server bei einem Auftragsverarbeiter betrieben
werden, ist dieser hier mit Name, Sitz und Vertragsgrundlage zu nennen.

## Kinder

Babyfunken richtet sich an Eltern. Die App wird von Erwachsenen bedient;
Kinder sind Gegenstand der Übertragung, nicht Nutzer der App. Es werden
keine personenbezogenen Daten von Kindern erhoben oder gespeichert.

## Deine Rechte

Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO)
sowie ein Beschwerderecht bei einer Aufsichtsbehörde.

Praktisch gilt: Es existieren keine bei uns gespeicherten Daten zu deiner
Person. Ein Löschverlangen erfüllst du selbst, indem du die Gruppe
verlässt oder die App deinstallierst.

## Änderungen

Änderungen dieser Erklärung werden hier veröffentlicht; das Datum oben
weist die jeweils geltende Fassung aus.

## Kontakt

⚠ E-Mail-Adresse für Datenschutzanfragen.
