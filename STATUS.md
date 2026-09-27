# ControlOS — verifierat nuläge 2026-09-27

## R1: exakt uppgiftsrevision i körning och separat granskningsstatus

Uppgifter kan nu startas genom en separat granskning i `/tasks`. Startbegäran binds till uppgiftsversion, registrerad arbetskopia, basrevision och vald provider. Servern bygger prompten från den sparade uppgiften. Samma begärandenyckel ger samma körning; ändrat innehåll nekas. Uppgift, körning och händelse sparas atomiskt vid köläggning, claim och avslut. Exit 0 ger `succeeded` på körningen och `awaiting_review` på uppgiften, aldrig automatisk acceptans. Se [kontrakt och kvarvarande gränser](docs/controlos/task-execution.md).

Köade jobb kontrollerar projekt, beroenden, behörighet och katalog-/Git-identitet igen innan start; vald basrevision måste fortfarande stämma. Registrerade arbetskopior av samma repo delar skrivspärr. Äldre karantänlås behålls och beaktas även när ett nytt jobb väljer en annan arbetskopia. Osäkert processtopp spärrar även redigering av den berörda uppgiften. Vid misslyckad lagring av avslut ligger aktiv status och skrivlås kvar; ingen lyckad agenthändelse publiceras i förväg.

`npm run verify` passerade med typkontroll, lint, 320 tester i 60 filer och byggning på Windows x64, Node 22.18.0 och npm 11.7.0. Nytt API-test använder en riktig lokal testprocess, ett temporärt Git-repo och återöppnad SQLite-profil. Separata tester provar omstart, ändrad bas/projekt/katalog, syskonarbetskopior, äldre lås och injicerade lagringsfel. Hela `npm run smoke` passerade, inklusive tangentbordsbekräftelse och ny körningsgranskning vid 1536/390 px. Bilderna har granskats; webbdelen använder uttryckliga DEMO-svar för körningen. Loggar: `controlos-task-execution-full-verify.log` och `controlos-task-execution-smoke.log` (ignorerade). Webbens chunkvarning kvarstår, cirka 546 kB före gzip.

T05 är nu lokalt godkänd med källhashar; T07/T20/T22/T43 har omprovats. Totalt är 5 av 46 scenarier lokalt godkända, 41 ännu inte fullständigt provade. Aktuella bevis och godkännande per acceptanskriterium, stabil behörighetsmigrering, verifierad sandbox och full R1–R4 återstår. Ingen riktig provider/model, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

## R2: uppgifter, Inbox, milstolpar och atomiska beroenden

Den nya vyn `/tasks` sparar uppgifter och milstolpar i en egen planeringsdomän. Uppgifter har mål, avgränsning, acceptanskriterier, prioritet, projekt-/repokoppling och beroenden. Projektägarskap kan inte flyttas genom redigering. GitHub-issues är enkelriktade referenslänkar. Versionskontroll nekar gamla ändringar; fält, beroenden och oföränderlig revisionshistorik sparas atomiskt. Beroendecykler visas med namn och ID:n och lämnar ingen halv uppdatering. Kriteriernas ID:n och obligatorisk/frivillig status bevaras vid omordning av oförändrad text.

Inbox accepterar idéer utan projekt. En innehållsbunden nyckel förhindrar dubblerad fångst vid retry. Konvertering skapar ett uppgiftsutkast och kvitterar idén i samma transaktion; upprepad identisk konvertering ger samma uppgift. Migration 0011 är additiv. Planeringsanrop kan inte sätta körnings-/acceptansstatus och startar ingen agent. Se [kontrakt, tester och återstående gränser](docs/controlos/planning-domain.md).

`npm run verify` passerade på Windows x64, Node 22.18.0 och npm 11.7.0: typkontroll, lint, 311 tester i 58 filer och byggning. Det riktiga API-testet provar cykelavslag och bevarat tillstånd efter återöppning av en SQLite-profil; lagringsfel mitt i konverteringen provas med full rollback. Efter sista rättningen av tillgänglighetsnamn passerade separat webbtypkontroll/riktad lint och hela `npm run smoke` igen. Webbläsarprovet använder riktig lokal HTTP/SQLite med uttryckliga demodata vid 1536/390 px: skapa/redigera, nekad cykel med exakt oförändrad plan, Inbox-konvertering, milstolpsredigering, omladdning och bevarade kriterieegenskaper. Körhistoriken är oförändrad före/efter. Bilderna har granskats. Slutloggar: `controlos-planning-complete-verify.log`, `controlos-planning-ui-final.log` och `controlos-planning-ui-final-smoke.log` (ignorerade). Tidigare browser-/syntaxfel och deras rättningar finns kvar i övriga `controlos-planning-*.log`. Webbens chunkvarning kvarstår, cirka 541 kB före gzip.

T07 är nu lokalt godkänd med versionsbundna källhashar; T20/T22/T43 har omprovats. Totalt är 4 av 46 scenarier lokalt godkända. Uppgiftsbunden exekvering, aktuella bevis per kriterium, vald nästa uppgift, offlineutkast och full R1–R4 återstår. Ingen modell eller pilotagent har startats, och piloternas filer är orörda. Följande avsnitt är historiska kontrollpunkter.

## R2-grund: separata projekt, repon och arbetskopior

Vyn `/projects` har nu ett beständigt register för projektmål, livscykel, fokus och manuell prioritet. Projekt, repon och arbetskopior får separata UUID:n. GitHub-identitet kommer från API:ts repo-ID; lokala arbetskopior binds till katalog- och Git-identitet. Importen är uttrycklig och visar observationernas tid. Arbetskopior i samma Git-repo återanvänder repoidentiteten; omdöpning på samma filsystem behåller arbetskopians ID. Utbytta kataloger och tyst omflyttning mellan projekt nekas. Migration 0010 bevarar äldre data. Se [kontrakt och begränsningar](docs/controlos/project-registry.md).

`npm run verify` passerade med typkontroll, lint, 307 tester i 56 filer och byggning på Windows x64, Node 22.18.0 och npm 11.7.0. Riktade tester använder riktiga temporära Git-repon, arbetskopior, junctions och återöppnad SQLite-profil. De kontrollerar också oförändrade lokala filer/index/config, nekad gammal redigeringsversion och bevarad spärr för agentstarter. `npm run smoke` passerade för skapa–redigera–importera–ladda om vid 1536/390 px med tydliga demodata. Bildgranskningen upptäckte att frånkopplingsknappen täckte mobilinnehåll; efter en layoutjustering passerade webbtypkontroll, riktad lint och hela smoke igen. De slutliga bilderna har granskats. Loggar: `controlos-registry-verify.log`, `controlos-registry-final-smoke.log` och `controlos-registry-ui-check.log` (ignorerade). Webbens chunkvarning kvarstår, cirka 526 kB före gzip.

Ingen pilot importerades eller startades och inga projektfiler ändrades. Import ger ingen körbehörighet. T20/T22/T43 har omprovats och källhasharna uppdaterats. T01/T02/T03/T34 och B10 är fortsatt öppna: uppgifter/kontextisolering, verifierat branch-head-val, SHA-bunden CI och full offline-roadmap återstår. Detta är grunden för en separat uppgiftsdomän, inte godkänd R2; R1–R4 förblir öppna. Följande avsnitt är historiska kontrollpunkter.

## R1: engångsbeslut med policyversion för resultatacceptans

Versionerade resultat granskas nu i två steg: ett fem minuter giltigt underlag förbereds, därefter bekräftas exakt samma operation, revision, innehåll och policyversion. Beslutet binds även till repo, arbetskopia, verifieringsbevis och tidigare mänskligt utfall. Förbrukning och resultatacceptans sparas atomiskt; återanvändning, utgången tid, ändrad policy eller ändrat innehåll nekas. Projektinställningar återkallar väntande underlag före ändringen, även om inställningen senare ändras tillbaka.

SQLite bevarar oföränderliga bindningar, terminala beslut och historiska policysnapshots. Migrering 0009 bevarar äldre körningar utan att skapa påhittade godkännanden. Vyn visar en separat bekräftelse och de senaste 20 granskningsposterna. Informations- och felmeddelanden har skilda färger och tillgänglighetsroller. Se [kontrakt, evidens och gränser](docs/controlos/acceptance-consistency.md).

Slutlig `npm run verify` passerade: typkontroll, lint, 302 tester i 54 filer och byggning på Windows x64, Node 22.18.0 och npm 11.7.0. API-testet använder ett riktigt temporärt Git-repo och en SQLite-profil; tester omfattar policybyte, ändrat innehåll, omverifiering, replay, atomisk rollback, återöppning och föregående databasschema. `npm run smoke` passerade separat för 1536/390 px, tangentbordsbekräftelse, separata förberedelse-/beslutsanrop, historik och meddelanderoller. Mobilbilden har granskats. Bilderna använder uttryckliga demofixtures. Loggar: `controlos-operation-final-verify.log` och `controlos-operation-confirmation-smoke.log` (ignorerade). Webbens storleksvarning kvarstår.

Ingen modell, pilotagent, merge eller deploy kördes. Registret gäller nu endast `result.accept`; andra operationsvägar behöver egna bindningar innan de kan använda det. Ägaridentiteten är fortfarande den lokala ägarnyckeln, inte en separat enhets-/personidentitet. T20/T22/T43 har omprovats och källhasharna uppdaterats. Full T26 och R1–R4 förblir öppna; inga nya fullständiga scenarier har godkänts. Följande avsnitt är historiska kontrollpunkter.

## R1: aktuell verifiering vid mänsklig acceptans

Acceptans av versionerade körningar går nu genom verifieraren med aktuell innehållskontroll och villkorad databasuppdatering. Ett samtidigt korrigerat mänskligt beslut skrivs inte över. Ändrat eller oläsbart innehåll tar bort tidigare verifieringsgodkännande; även misslyckad förkontroll inför omverifiering ogiltigförklarar gammal acceptans. Körningsvyn hämtar om status efter nekad acceptans/verifiering så att en gammal grön etikett inte ligger kvar. Se [kontrakt och gränser](docs/controlos/acceptance-consistency.md).

Claude-adaptern sänker inte längre Windows-processövervakarens prioritet. Windows-värd och arbetare behåller ärvd prioritet. Kraschfixturen väntar på övervakarens eget avslut innan arbetskatalogen tas bort; stoppkvittot gäller agentträdet och kan publiceras tidigare. Processfixturerna bevarar ursprungsfelet om även städningen misslyckas.

Slutlig `npm run verify` passerade på Windows x64, Node 22.18.0 och npm 11.7.0: typkontroll, lint, 296 tester i 51 filer och byggning. `npm run smoke` passerade med märkta API-fixtures för nekad acceptans/omverifiering samt befintliga desktop-/mobilflöden. De 24 riktade process-/verifieringstesterna och de två återhämtningstesterna passerade också separat. Loggar: `controlos-approval-complete-verify.log`, `controlos-approval-smoke-recheck.log`, `controlos-approval-inherited-priority.log` och `controlos-approval-receipt-cleanup.log` (ignorerade). Webbens storleksvarning kvarstår.

Tidiga helkörningar fallerade i processfixturer; en prövad sänkning av Windows-arbetarnas prioritet gav 13 testfel och togs bort. En senare helkörning hade 295 godkända tester och ett EBUSY-fel när kraschfixturens katalog togs bort. Den korrigerade fixturen passerar nu i fullsviten. Webbläsartestet hittade också den kvarhängande verifieringsstatus som rättats. Dessa tidigare fel finns kvar i `controlos-approval-*.log`; slutresultatet ovan ersätter inte deras historik.

Ingen modell eller pilotagent startades. T20/T22/T43 har omprovats och källhasharna uppdaterats; övriga scenariostatusar är oförändrade. Policybundna operationsgodkännanden, full T06/T26 och hela R1–R4 återstår. Följande avsnitt är historiska kontrollpunkter.

## R1: konfiguration skild från verifierad anslutning

Anslutningsstatus skiljer nu sparad nyckel från autentisering. GitHub har en manuell, läsande kontroll med tidsstämpel, tiosekundersgräns och nekade omdirigeringar. Utgångna/avvisade nycklar, otillgänglig kontroll och saknat verifieringsstöd visas separat. Nyckelbyte och omstart ogiltigförklarar resultatet; efter fem minuter blir det inaktuellt. Inställningskorten har också fått läsbar mobilbredd.

Slutlig `npm run verify` passerade på Windows med 295 tester i 51 filer, typkontroll, lint och byggning. Den första körningen fick två timeouter i befintliga processflödestester under samtidiga kontroller; båda passerade separat och i omkörningen utan samtidiga native-/webbläsartester. `npm run smoke` passerade med märkta credential-fixtures vid 1536/390 px; native-migreringen passerade igen. Loggar: `controlos-connections-final-verify.log`, `controlos-connections-final-smoke.log`, `controlos-connections-native.log` samt den första körningens `controlos-connections-verify.log` (ignorerade).

Ingen riktig GitHub-nyckel verifierades. Full T25 är fortfarande öppen tillsammans med R1–R4. Se [kontrakt och testgränser](docs/controlos/connection-verification.md). Följande avsnitt är historiska kontrollpunkter.

## R1: avbrottstålig Windows-kryptering av nyckelfiler

Ett nytt native-test visade att den tidigare Electron-krypteringen kunde klara round-trip i samma process men misslyckas efter ett omedelbart processavslut i en ny profil. Windows desktop använder därför nu en separat DPAPI-hjälpprocess för varje credential. Värden går via privata pipes, inte argument. Läsbara äldre Electron-nycklar migreras; tomma, trasiga eller oläsbara tokenfiler ersätts inte längre med en ny nyckel.

`npm run verify` passerade på Windows x64, Node 22.18.0 och npm 11.7.0: typkontroll, lint, 293 tester i 50 filer och byggning. Native-provet med Electron 44.4.5 passerade avbrott mellan migreringsstegen, återöppning och migration från äldre kryptering. Endast syntetiska nycklar användes. Loggar: `controlos-profile-final-verify.log` och `controlos-native-profile-final.log` (ignorerade).

Se [protokoll, återställningsgränser och reproduktion](docs/controlos/native-credentials.md) samt [versionsbunden evidens](docs/controlos/native-credential-evidence.json). Detta gäller credentialfiler i en engångsprofil. Full profilmigrering, riktig återställning, annat OS-konto och installeruppdatering återstår. R1–R4 förblir öppna; inga fullständiga scenarier har godkänts i denna etapp. Följande avsnitt är historiska kontrollpunkter.

## R1: maskering före förkortning och i felrapporter

Agenternas progress/resultat maskeras nu före förkortning; verktygsnamn och körmotorns loggar skyddas också. Kända hemligheter maskeras även i standardkodade URL-/JSON-former. Incidenter maskeras före diagnos och lagring, diagnossvar före publicering och oväntade HTTP-fel före svar/loggning.

`npm run verify` passerade på Windows x64, Node 22.18.0 och npm 11.7.0 med 287 tester i 48 filer, typkontroll, lint och byggning. Därefter passerade två tillagda Codex-canaryfall tillsammans med hela adapterns nio tester. Sju riktade tester för maskering och felrapporter passerade också. Loggar: `controlos-redaction-verify.log`, `controlos-redaction-final-targeted.log`, `controlos-redaction-codex.log` (ignorerade). Ingen modell/API kördes; ingen UI ändrades i denna etapp.

T23 är fortsatt ej fullständigt godkänd: samtliga export-, rapport- och integrationsytor behöver genomgående acceptans. Se [evidens och begränsningar](docs/controlos/redaction-evidence.md). R1–R4 är fortfarande öppna. Följande avsnitt är historiska kontrollpunkter.

## R1: begränsad agentutdata och synlig diagnostikförlust

Claude/Codex dränerar nu stdout med begränsade rader och köer. Överskriden gräns stoppar processen med tydlig felorsak; skrivlåset väntar fortfarande på processutfallet. Stderr redigeras per begränsad rad innan den behålls, och bortkastad utdata ger en synlig förlustmarkering. Se [gränser och evidens](docs/controlos/process-output.md).

`npm run verify` passerade på Windows x64, Node 22.18.0 och npm 11.7.0: typkontroll, lint, 281 tester i 46 filer och byggning. De slutliga flödesfallen passerade separat efter två små felhanteringsjusteringar. `npm run smoke` passerade inklusive diagnostikförlust vid 1536/390 px. Loggar: `controlos-output-verify.log`, `controlos-output-final-targeted.log`, `controlos-output-smoke.log` (ignorerade).

T22 är lokalt godkänd för agentadaptrarna med offlineprocesser; T20/T43 kördes om och källhasharna uppdaterades. Ingen riktig modell eller pilotagent kördes. Övriga processadaptrar, full T23-kontroll av hemligheter, sandbox och profilmigrering återstår; hela R1–R4 är fortsatt öppna. Följande avsnitt är historiska kontrollpunkter.

## R1: beständigt stoppkvitto och säker låsåterställning

Windows-värden skriver nu ett autentiserat kvitto efter bekräftat tomt Job Object. Om servern kraschar kan nästa start, eller knappen för ny stoppkontroll, verifiera kvittot och atomiskt frigöra skrivlåset. Den avbrutna körningen förblir misslyckad; bara ett redan accepterat nästa jobb kan fortsätta. Återställningen signalerar aldrig ett lagrat PID. Saknade eller felaktiga kvitton och äldre protokoll behåller låset. Samma OS-användare är fortsatt en gemensam tillitsgräns.

`npm run verify` passerade på Windows x64, Node 22.18.0 och npm 11.7.0: typkontroll, lint, 274 tester i 44 filer och byggning. Testerna omfattar abrupt ägaravslut, återöppnad SQLite-profil, native-kvitto, bevarat lås vid lagringsfel och en orelaterad process vars PID finns i injicerad gammal metadata. Faktisk PID-återanvändning har inte framtvingats. T20/T43 har körts om och källhasharna uppdaterats; inga andra fullständiga scenarier har markerats godkända.

`npm run smoke` passerade inklusive ny stoppkontroll vid 1536/390 px med märkta demofixtures. Loggar: `controlos-receipt-verify.log`, `controlos-receipt-atomic.log` och `controlos-receipt-smoke.log` (ignorerade). Ingen modell eller pilotagent startades. Webbens storleksvarning kvarstår.

Hela R1 är fortfarande öppen: kraschfönster utan beständig identitet/kvitto, POSIX/övriga processadaptrar, verifierad fil-/nätverkssandbox och full native-profilmigrering återstår. Se [protokoll och begränsningar](docs/controlos/native-process-host.md) och [kraschmatris](docs/controlos/execution-recovery.md). Följande avsnitt är historiska kontrollpunkter.

## R1: Windows-processidentitet och bekräftat stopp

Windows-körningar med Claude/Codex använder nu en native Job Object-värd. Agenten skapas suspenderad, tilldelas jobbet och får inte köras förrän dess exakta identitet har lagrats. Avslut bekräftas först när jobbets aktiva processantal är noll. Tappad värd eller bekräftelse behåller skrivlåset. Bekräftelsen visas i körningsdetaljen; återdispatch från ett obekräftat resultat är spärrad. Se [processvärdens protokoll och begränsningar](docs/controlos/native-process-host.md).

`npm run verify` passerade på Windows x64, Node 22.18.0 och npm 11.7.0: typkontroll, lint, 270 tester i 42 testfiler och byggning. `npm run smoke` passerade, inklusive bekräftat/obekräftat/äldre processtillstånd vid 1536 och 390 px. Bilderna använder tydligt märkta API-fixtures, inte riktiga agentresultat. Loggar: ignorerade `controlos-native-final-verify.log` och `controlos-native-smoke.log`.

T20 är lokalt godkänd via riktig körmotor, Codex-adapter, ignorerad interrupt, utlöpt grace-period och två nivåer barnprocesser. T43 har körts om; källhashen är uppdaterad. Ingen modell eller pilotagent startades. Hela R1-grinden är fortfarande öppen: säker återhämtning av karantänlås efter tappat slutkvitto, POSIX/övriga processadaptrar, verifierad fil-/nätverkssandbox och full native-profilmigrering återstår. Windows-installer/uppdatering och fjärr-CI har inte verifierats i denna etapp. Webbens storleksvarning kvarstår.

## R1: transaktionell händelselogg och återanslutning

Köacceptans, claim och terminal körstatus sparar nu sina build-händelser i samma SQLite-transaktion. Händelseloggen fungerar som lokal outbox med leverans efter commit och återspelning efter omstart. Felande prenumeranter kan inte avbryta dispatch. Misslyckad claim behåller det accepterade jobbet i kön; misslyckad terminal lagring behåller skrivlåset.

Abrupta processavslut före och efter commit, injicerade lagringsfel och återanslutning över riktig loopback-HTTP har testats. T43 är lokalt godkänd med miljö och källhashar i acceptansregistret. Se [kraschmatrisen](docs/controlos/execution-recovery.md). Övriga scenarier och hela R1-grinden är fortsatt ej godkända.

Slutlig `npm run verify` passerade på Windows, Node 22.18.0 och npm 11.7.0: typkontroll, lint, 261 tester i 40 testfiler samt byggning. Ignorerad logg: `controlos-outbox-final-verify.log`. Webbens storleksvarning kvarstår. Smoke och fjärr-CI har inte körts för denna ändring. Bekräftat processträdsstopp, beständig processidentitet och verifierad sandbox återstår.

## R1-tillägg efter PR #7

Utgår från inmergad `main` på `0bcd846`, med ändringen på `codex/controlos-r1-uncertain-exit`. Om processens avslutspromise avvisas behålls nu det beständiga skrivlåset även om stoppanropet kastar fel. Körningen markeras som misslyckad med okänt processutfall; nästa jobb för samma repo får vänta. Ett strömfel håller kvar låset tills processavslut har observerats.

Lokalt `npm run verify` passerade på Windows, Node 22.18.0 och npm 11.7.0: typkontroll, lint, 253 tester och byggning. Tre nya regressionstester täcker felvägarna och kvarvarande lås efter återöppning av en SQLite-profil; ett annat repo kan fortfarande köras. Logg: ignorerade `controlos-r1-verify.log`. Webbens storleksvarning kvarstår. Smoke och fjärr-CI har inte körts i denna etapp.

Detta bevisar inte stopp av hela processträd. Processidentitet, OS-inneslutning och säker frigöring av karantänlås återstår; ingen full R1-grind eller acceptansscenario har markerats godkänt. Nuläget nedan avser föregående stabiliseringsetapp.

Arbetet fortsätter i samma ADO-projekt från `bb19caba68c1cda13249c8d722a9b6647133dc8f`, på `codex/controlos-stabilization`. Detta är en stabiliseringsetapp, inte en färdig ControlOS-v1. Originalarbetskopian och användarens nedladdade underlag har bevarats.

## Genomfört

- Webbläsaren ansluter med en nyckel vid körning. Nyckeln skickas inte längre med den byggda webbappen eller av den nya SSE-klienten i URL:er. Desktop använder sin privata runtime-kanal.
- Skrivning till TASK.md vägrar hårda länkar, symboliska länkar och utbytta filer; reguljära uppgiftsfiler fungerar fortsatt.
- Agentprocessens avslut och dataströmmens avslut hanteras separat. Köade jobb lagras och kan återupptas efter omstart. Idempotensnycklar förhindrar dubbletter. Repon får en skrivare åt gången och resultat skapas i separata Git-arbetskopior.
- Avbrutna tidigare körningar återstartas inte automatiskt. Deras skrivlås hålls kvar eftersom en serverkrasch inte bevisar att alla underprocesser är avslutade.
- Resultat har Git-revision och innehållshash. `npm run verify` kan köras separat med lagrat resultat; mänsklig acceptans av nya körningar kräver samma verifierade innehåll. Detta genomför ingen merge eller publicering.
- Säkerhetskopior får kontrollsummor och en återställningsväg till en ny profil. Trasiga datafiler får inte tyst ersättas med tomma standardvärden. Ogiltiga projektregler stoppar inläsningen.
- Desktop krypterar anslutningsnycklar och sin åtkomstnyckel med operativsystemets nyckelskydd. CLI-profiler använder fortfarande skyddade klartextfiler. Samma OS-användare är fortfarande en gemensam tillitsgräns.
- Repoidentiteter skiljer lokala sökvägar och GitHub owner/name. CI, agentresultat och påstådd TestFlight-uppladdning redovisas tydligare som olika källor.
- Mobilanpassade kärnvyer och ett experimentellt Codex-gränssnitt finns. Codex kräver befintlig ChatGPT-inloggning och har ingen automatisk API-betalningsfallback.
- CI-definitionen kör verifiering på Windows/Ubuntu och Node 22.18/24. Aktuella fjärrkörningar och obligatoriska merge-regler är inte bevisade av lokala tester.

## Kontrollresultat

Miljö: Windows, Node 22.18.0, npm 11.7.0.

| Kontroll | Resultat och begränsning |
|---|---|
| `npm run verify` | Godkänd: typkontroll, lint, 250 tester och byggning. Inkluderar policyregression, felaktiga dispatchfält samt innehållskontroll av binära filer och filnamn med inledande blanksteg. |
| `npm run smoke` | Godkänd: byggd webb utan testhemlighet, rätt/fel nyckel, frånkoppling, omladdning, desktop-runtime och 1536/390-pixelvyer. Bilderna använder uttryckligen demodata. |
| Codex-protokoll | Fem offlinefall passerade: lyckad körning, nekad approval med kolliderande RPC-ID, API-konto nekas, trasig JSON nekas, stopp. |
| Installerad Codex | CLI 0.157.0 svarade på initialize/account-read och rapporterade ChatGPT-konto. Ingen riktig modelluppgift genomförd. |
| Electron 44.4.5 / Windows | Separat native-probe passerade OS-kryptering, dekryptering och att klartexten saknas i ciphertext. Full profilmigrering/installeruppdatering återstår. |
| Produktionsberoenden | `npm audit --omit=dev`: 0 rapporterade sårbarheter. |
| Alla beroenden | 4 måttliga träffar i drizzle-kit → esbuild-kit → esbuild. Inga höga/kritiska. Ingen tvingad nedgradering har gjorts. |
| Byggstorlek | Webb-JavaScript cirka 512 kB före gzip; Vite varnar för en chunk över 500 kB. Uppdelning återstår. |

Lokala loggar och skärmbilder ligger i ignorerade `*.log` och `smoke-shots/`. Detta är testresultat för denna arbetskopia, inte bevis på en publicerad version eller komplett acceptans.

## Vald pilot och inställning

Tre projekt har inventerats utan kodändringar: Economy Dashboard (webb/mobil), Dynasty Manager (spel/mobil), Youtube-Project (webb/Python). Maskinspecifika sökvägar, revisioner och scripts finns lokalt i `data/pilot/inventory.json` och läggs inte i Git.

Economy Dashboard har ingen första Git-commit. Dynasty Manager har två ändrade dokument och Youtube-Project en lokal ändring vid kontrollen. En separat lokal profil har skapats med alla tre projekten. Profilen har lästs in igen och API-kontroller visar att agentstarter är spärrade för samtliga. `.env` pekar på profilen för nästa `npm run dev`; inga nycklar finns i Git. Ingen agent har startats i dessa projekt och inget pågående arbete har städats bort. Economy måste få en beslutad versionsbas innan isolerade agentjobb kan användas. Verifieringskommandon måste också kopplas till respektive projekt; ingen av dessa tre har rotkommandot `npm run verify` som den första verifieraren kräver.

Rekommenderad driftprofil för första användningen: lokal Windows-värd, manuellt startade jobb, en körning i taget, Codex först efter live-acceptans, automatiska ändringar/merge/deploy avstängda. iOS-byggen kräver en separat Mac-värd; Windows räknas inte som ett godkänt iOS-byggtest.

## Prioriterat kvarvarande arbete

1. R1: processidentitet och bekräftat stopp av hela processträd, säker hantering av karantänlås, transaktionell outbox/kraschmatris, verifierad sandbox samt full native-profilmigrering. Worktrees är inte en OS-sandbox.
2. R2: separat projekt/repo/checkout-register, uppgifter och Inbox, beroenden/milstolpar, versionsbundna kontextpaket, Today samt förklarbar kapacitetsplanering/Universe.
3. R3: privata HTTPS-anslutningar, enhetsparning/återkallning, offlineutkast, riktig provider-körning och kvotvisning. Mobil layout är inte en fjärranslutningslösning.
4. R4: återställning av en riktig profil, Windows-installer/uppdatering, projektanpassade verifieringskommandon och nyttopilot över minst fem verkliga arbetstillfällen.

Alla 24 krav, 20 arbetsdelar och 46 fullständiga acceptansscenarier finns i `docs/controlos/acceptance-register.json`. Scenarierna markeras inte som godkända bara för att närliggande enhetstester är gröna. Ingen full R1–R4-grind är ännu godkänd.

## Återbruk

Behåll React-vyerna, komponentbiblioteket, SQLite, händelsekontrakten, lokala scanners och de integrationer som har verkliga källor. Fortsätt avgränsa körmotor, verifiering och behörigheter bakom tydliga gränssnitt. Ersätt historiska fasnummer som statuskälla med kontroller knutna till version och miljö. Bygg planeringsdomänen separat från agentkörningar; lägg inte task-status ovanpå processens exitkod.

## Windows runtime-korrigering

Den första CI-matrisen upptäckte två fel på Windows/Node 22.12, medan Node 24 och båda Ubuntu-jobben passerade. Ett lokalt test med kontrollsummaverifierad Node 22.12 återgav orsaken: lstat rapporterade dev=0 och fstat samma fils verkliga volym-ID. Node 22.18 gav matchande värden. Stödet kräver därför Node 22.18+ i 22-serien eller Node 24.11+, med tydligt startfel på äldre versioner. Filidentitetskontrollen har behållits strikt. [Libuv 1.51:s ändringslogg](https://raw.githubusercontent.com/libuv/libuv/v1.51.0/ChangeLog) dokumenterar rättningen av volymnumret. CI-matrisen körs om på den deklarerade lägstanivån.
