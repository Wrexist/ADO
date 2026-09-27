# ControlOS — verifierat nuläge 2026-09-27

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
