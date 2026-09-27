# Verifieringsprocesser och beständigt skrivarägarskap

`npm run verify` körs i resultatets isolerade arbetskopia och kan skriva filer. Därför tar även verifieraren ett beständigt repolås innan förkontroll och processstart. Migration 0015 sparar ett separat verifieringsförsök med kommando, arbetskopia, Git-identitet, bas, revision och innehållshash. Dessa mål och den först sparade processidentiteten får inte skrivas om. Tidigare bevis bevaras; nya bevis pekar på sitt verifieringsförsök.

Försök och lås skapas i samma transaktion som återkallar tidigare verifiering och acceptans. Agentjobb kontrollerar verifieringslås vid köval och claim. Kontrollen omfattar scanner-ID, registrerad repoidentitet och fysisk gemensam Git-katalog, även för oregistrerade syskon-worktrees. Okänd identitet är inte tillstånd att börja skriva. Befintliga agentlås behåller sina nycklar och sin karantän.

Migration 0016 begränsar profilen till två samtidiga skrivarägarskap totalt. Verifieringar, agenter och kvarhållna karantänlås räknas tillsammans. SQLite nekar ett tredje lås även vid konkurrerande anslutningar. Ett verifieringsanrop utan kapacitet nekas innan något nytt försök skapas eller tidigare bevis/acceptans återkallas; anropet köas inte automatiskt. Bekräftad frigöring väcker agentkön. Gamla profiler med fler lås behåller dem och väntar på verifierad återhämtning. Gränsen avser jobb i denna profil, inte antalet underprocesser eller andra profiler.

På Windows används samma native Job Object-värd som för agentkörningarna. Processidentiteten sparas innan den suspenderade processen får fortsätta. Godkänt slut kräver att native-värden har observerat noll processer i jobbet. Båda utdataströmmarna dräneras med begränsade buffertar och redigering av hemligheter. Resultatets innehåll kontrolleras efter avslutat processträd. Bevis, slutstatus och upplåsning sparas atomiskt.

Avbrott och återhämtning:

- Förkontroll som misslyckas innan spawn markerar försöket som misslyckat och släpper låset.
- Osäkert spawn- eller processutfall lämnar skrivarägarskapet i karantän. En processadapter som kastar ett fel bevisar inte att ingen process skapades.
- Vid omstart återstartas inget verifieringskommando. Ett kvarvarande lås kan bara hävas med ett autentiserat stoppkvitto för just verifieringsförsökets processidentitet. Agentkörningens gamla kvitto används aldrig för detta.
- Ett återhämtat försök är avbrutet, även om kvittot innehåller exitkod noll. Det skapar inget verifieringsbevis.
- Serveravslut begär stopp och väntar på verifieringsjobben innan databasen stängs. Användaren kan också begära stopp i körningsvyn. Begäran är skild från bekräftat stopp.

Körnings-API:t visar begränsade försöksposter och om verifieringslåset finns. Privata processidentiteter och kvittonycklar skickas inte till klienten. Den öppna körningsvyn uppdateras även efter agentprocessens avslut. `POST /api/runs/:id/verify/stop` stoppar endast ett lokalt ägt verifieringsförsök; `POST /api/runs/:id/verify/reconcile` kontrollerar dess lagrade stoppkvitto.

På andra plattformar används fortfarande adaptern för lokal betrodd processgrupp. Den redovisar `root_exited`, inte bekräftat stopp av hela processträdet. Omstart utan verifierbart stopp håller låset kvar även där. Full POSIX-isolering och processgruppsattestering återstår. Denna ändring gör inte arbetskopior till en OS-sandbox och migrerar inte alla andra hjälpprocesser till samma kontrakt. Även kraschen före sparad processidentitet kan kräva fortsatt karantän. Samma OS-användare är fortfarande en gemensam tillitsgräns.

Lokala regressioner finns i `verificationOwnership.test.ts`, `verification.test.ts` och `taskReviewApi.test.ts`. De omfattar återöppnad databas, atomisk claim, osäker spawn, agentkvitto som inte får återbrukas, syskon-worktree, riktigt Windows-processträd vid serverstopp och separat verifierarprocess som kraschar under verklig npm-körning. `scripts/smoke.mjs` använder tydligt märkta DEMO-data för stopp, karantän och kvittokontroll i desktop- och mobilvyn. Fulla acceptansgrindar markeras inte godkända av dessa delprov.
