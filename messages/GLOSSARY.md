# Glossario di traduzione (it → en)

Da dare a chi traduce (persona o modello) insieme al file `messages/it/<area>.json`.
Regole: frase breve, tono diretto, seconda persona; copy italiano in
«sentence case», inglese in sentence case (non Title Case); segnaposto `{nome}`
identici; stessa struttura di chiavi nei due file (lo controlla `tests/i18n.test.ts`).

| Italiano | English | Note |
| --- | --- | --- |
| Zitto e Corri | Zitto e Corri | Nome del prodotto, non si traduce |
| coach / Coach AI | coach / AI coach | |
| piano (di allenamento) | plan / training plan | |
| seduta | session | «workout» se è l'allenamento in sé |
| corsa / corse | run / runs | |
| facile, medio, soglia | easy, steady, threshold | Zone di ritmo |
| ripetute | intervals | |
| lungo | long run | |
| tempo run | tempo run | |
| passo / ritmo | pace | Ritmo in min/km |
| forma | fitness | Nelle viste di carico: fitness / fatigue |
| fatica | fatigue | |
| carico | load | |
| recupero | recovery | |
| FC / HR | HR | Frequenza cardiaca |
| zone cardiache | heart-rate zones | |
| obiettivo | goal | |
| gara | race | |
| Mezza / Maratona | Half / Marathon | |
| «Non al 100%» | “Not feeling 100%” | |
| orologio | watch | |
| collegamenti | connections | Tab delle impostazioni |
| impostazioni | settings | |
| chiave (API) | key (API key) | |
| tempo target | target time | |
| dati salute | health data | |

Le unità restano `km`, `min/km`; formattazione di date e numeri segue la lingua
dell'app (non va scritta a mano nelle stringhe).
