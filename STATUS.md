# ControlOS — verifierat nuläge 2026-09-27

## Codex kräver matchande livscykel

`npm run verify` passerade på Windows x64 / Node 22.18.0 / npm 11.7.0: typkontroll, lint, 398 tester i 85 filer och byggning. Logg: `controlos-codex-lifecycle-verify.log`.

Codex-adaptern avvisar nu start-/sluthändelser utan matchande tråd- och turnidentitet samt slutstatus med okänt värde eller fel datatyp. Startnotifikation före svaret stöds när identiteterna stämmer. Fel ger generisk diagnostik och stopp av den ägda processen; rå providertext återges inte.

Fem nya felprov misslyckades före rättningen. Den utökade sviten med 17 verkliga lokala barnprocessprov passerade, inklusive sju avvisningsfall, giltig ordningsvariation, stopp, nekad approval och API-konto. Detta är offlineprotokollprov, ingen modellkörning. Loggar: `controlos-codex-lifecycle-before.log` och `controlos-codex-lifecycle-focused.log`. [Kontrakt och begränsningar](docs/controlos/codex-lifecycle.md).

T30 är fortsatt öppet: versions-/kapabilitetsförhandling, framtida obligatoriska event och hela UI-flödet är inte verifierade. 15/46 scenarier är fortsatt lokalt godkända; R1–R4 är öppna. Följande avsnitt är historiska kontrollpunkter.

## Diagnostik maskeras före trimning

Hela `npm run verify` passerade på Windows x64 / Node 22.18.0 / npm 11.7.0: typkontroll, lint, 390 tester i 85 filer och byggning. Logg: `controlos-diagnostic-redaction-verify.log`.

Ett reproducerat sekretessfel är rättat: stderr trimmade tidigare avslutande blanksteg före maskeringen, vilket kunde lämna kvar en del av ett känt känsligt värde. Komplett diagnostikrad maskeras nu först. Regressionen misslyckades före rättningen och passerar efteråt.

En riktig lokal Node-barnprocess genom ClaudeSpawner provar stdout, verktygsnamn, stderr uppdelad över skrivningar, kodad URL och providerfel genom körmotorn. Resultat/diagnostik i SQLite, händelser, prenumerationsramar, snapshot, tidslinje och körloggar saknar kanarievärdet. En separat kontroll av den sparade fixturdatabasens bytes fann heller ingen kanariemarkör. Barnprocessen är en offlinefixtur; ingen modell eller användarcredential används. [Omfattning och kvarvarande luckor](docs/controlos/redaction-evidence.md).

17 riktade tester passerade. Loggar: `controlos-diagnostic-redaction-before.log` (förväntat fel före rättning) och `controlos-diagnostic-redaction-focused.log` (godkänd). T23 och full R1 är fortsatt öppna; alla UI-, export- och rapportytor är ännu inte verifierade. 15/46 fullständiga scenarier är fortsatt lokalt godkända. Följande avsnitt är historiska kontrollpunkter.

## T37: historiskt done är inte verifierat resultat

API:t kräver nu verifieringsbevis för samma körning, Git-revision, innehållshash och omdöme innan ett oberoende verifieringsresultat visas. Ett äldre sparat pass/fail räcker inte. Historiska exekveringsresultat och mänskliga omdömen bevaras i databasen.

Ett riktigt diskbaserat migrationsprov börjar med schema 0000–0004 och tre syntetiska äldre done-körningar, applicerar aktuella migrationer genom produktionsservern och kontrollerar autentiserade list-/detaljanrop över två starter. Körningarna förblir succeeded men verifieringen är null/okänd; inga tasks, godkännanden eller verifieringsbevis skapas. Provet misslyckades före rättningen och passerar efteråt. [Kontrakt och avgränsning](docs/controlos/legacy-verification.md), [versionsbundet underlag](docs/controlos/legacy-verification-evidence.json).

`npm run verify` passerade: typkontroll, lint, 388 tester i 85 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. Nio riktade migration-/verifierings-/godkännandetester passerade också. Loggar: `controlos-legacy-verification-verify.log` och `controlos-legacy-verification-focused.log`. Ingen ny UI-ändring eller paketerad Windows-artefakt ingår.

15/46 scenarier är nu lokalt godkända. T37 gäller detta migrationsprov; full R1, avbruten migration, installeruppdatering och verklig profilåterställning är fortsatt öppna. Följande avsnitt är historiska kontrollpunkter.

## T38: förbrukade turns är inte uppgiftens framsteg

Den breda `npm run smoke` passerade också: anslutning, desktop-runtime, dator-/mobilvyer, tema och uppgiftsgranskning. Logg: `controlos-turn-progress-smoke.log`. Vyerna använder uttryckligen demodata.

Körningskort med okänd framstegsgrad visar nu uttryckligen `Progress unknown`, utan procentsiffra eller dekorativt delvis fylld stapel. T38 har provats genom riktig adapter, körmotor, autentiserad HTTP/SSE och byggd webb med en isolerad offline-provider: 8 rapporterade turns och konfigurerat tak 20. Processavslutet hölls kvar medan kortet granskades vid 1536/390 px; inget 40-procentspåstående eller progressbar renderades. Efter avslut sparades 8 turns utan mänskligt godkännande. Bilderna är granskade. [Reproducerbart prov och avgränsning](docs/controlos/turn-progress.md), [käll-/artefakt-/bildhashar](docs/controlos/turn-progress-evidence.json).

Det första provet upptäckte att snabba statusuppdateringar kunde få samma händelse-ID och tappas. Fryst klocka reproducerade felet: bara första uppdateringen överlevde. Händelserna får nu oberoende UUID:n; regressionen bevarar samtliga fyra uppdateringar. Inga fördröjningar lades till för att dölja felet.

Slutlig `npm run verify` passerade med typkontroll, lint, 387 tester i 84 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. Det särskilda browserprovet passerade på Chromium 153.0.8010.12, med granskade dator- och mobilbilder. Provet har separat godkänd lint. Loggar: `controlos-turn-progress-final-verify.log`, `controlos-turn-progress-probe-final.log`, `controlos-turn-progress-final-lint.log`; bilder: `smoke-shots/turn-progress-1536.png` och `smoke-shots/turn-progress-390.png`.

14/46 scenarier är nu lokalt godkända. T38 visar korrekt rendering av rapporterad förbrukning; det är inte en verklig modellkörning, kvotmätning eller paketerad desktop-acceptans. REQ22 och samtliga R1–R4-grindar är fortsatt öppna. Följande avsnitt är historiska kontrollpunkter.

## Samma historikskydd vid normal omstart

Normal avstämning och återspelning av befintliga kvitton använder nu samma regel som återställningspanelen: nyare eller tvetydig historik får inte skrivas över. Alla skrivningar av automationers senaste körning kontrollerar filinnehållet mot den inlästa definitionen och använder bevakad, flushad filersättning. Ändrade/oläsbara filer och hårda länkar vägras. Redan matchande historik kontrolleras utan omskrivning.

Nya accepterade uppdrag skiljs från återspelning. Två avsiktliga starter kan ha samma tidsstämpel och får ändå varsitt körnings-ID. 30 riktade tester passerade, inklusive bevarade filbytes/minnestillstånd/kvitton vid fel, spärrad ny dispatch och fryst klocka för två nya starter. Hela `npm run verify` passerade med typkontroll, lint, 386 tester i 83 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. Loggar: `controlos-automation-projection-final-focused.log` och `controlos-automation-projection-verify.log`.

13/46 fullständiga scenarier är fortsatt lokalt godkända; R1–R4 är öppna. Ingen UI-ändring eller ny paketerad Windows-artefakt ingår i denna kontrollpunkt. [Kontrakt och avgränsning](docs/controlos/automation-persistence.md). Följande avsnitt är historiska kontrollpunkter.

## Granskning av automationshistorik i återställda profiler

Återställningspanelen kan nu lista och uttryckligen granska kvarvarande automationskvitton. Befintliga recept kräver `RECORD AUTOMATION HISTORY`; saknade recept kräver `ACKNOWLEDGE MISSING AUTOMATION` och återskapas inte. Åtgärden binds till aktuell körning, kvitto, definition, lås och filinnehåll. Inaktuellt underlag, ändrade/oläsbara filer och nyare eller tvetydig historik vägras. Körningar, resultat, godkännanden och lås lämnas oförändrade; övriga aktiveringsblockerare kvarstår.

Kvittoavstämning och audithändelse sparas atomiskt i SQLite. JSON-historiken kan ha skrivits dessförinnan: om auditcommit misslyckas visas detta uttryckligen och kvittot behålls för en ny granskning. Felprovet bekräftar att ett omprov inte skapar dubbletta audithändelser eller skriver om redan matchande historik. [Kontrakt och begränsningar](docs/controlos/automation-persistence.md#explicit-restored-profile-review).

Hela `npm run verify` passerade med typkontroll, lint, 382 tester i 83 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. 26 riktade tester passerade också. Hela browser-smoke passerade; båda nya bekräftelseflödena provades vid 1536/390 px med spärrad tvetydig historik och utan horisontell överströmning. Bilderna är granskade och använder uttryckligen demodata. Loggar: `controlos-recovery-receipts-focused.log`, `controlos-recovery-receipts-verify.log`, `controlos-recovery-receipts-smoke.log`; bilder: `smoke-shots/recovery-automation-*.png`.

13/46 fullständiga scenarier är fortsatt lokalt godkända. R1–R4 är öppna. Detta är ingen verklig användarprofil, ny paketerad app, installer/uppdatering eller strömavbrottsacceptans. Gamla körningar utan kvitto och konflikter i historiken behöver separat hantering. Ingen verklig provider- eller pilotkörning, merge eller publicering genomfördes. Följande avsnitt är historiska kontrollpunkter.

## Beständig avstämning av accepterade automationskörningar

En accepterad automationskörning sparar nu körningsrad, köhändelse och automationskvitto i samma SQLite-transaktion. Högst ett oavstämt kvitto per automation tillåts. Historiken i JSON skrivs från det kvittot och markeras därefter som avstämd. Vanlig serverstart reparerar kvarvarande historik utan att anropa dispatch. Ett fel efter commit kan därför hitta den redan accepterade körningen. Saknad automationsdefinition eller misslyckad reparation behåller kvittot och spärrar fler automationstarter.

Fyra riktiga processavbrott har provats: före transaktionscommit, efter commit, efter JSON-skrivning och efter kvittots avstämning. Återöppning bevarar accepterat arbete utan en extra dispatch. Ytterligare prov täcker transaktionsrollback, fel efter commit, lagringsfel, upprepad pending-dispatch samt riktig serverstart. Återställda profiler gör ingen automatisk historikreparation; oavstämda kvitton ingår i granskningsdigest och blockerar aktivering. [Kontrakt och kraschmatris](docs/controlos/automation-persistence.md).

Hela `npm run verify` passerade: typkontroll, lint, 379 tester i 82 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. 24 riktade tester passerade också. Loggar: `controlos-automation-journal-integration.log` och `controlos-automation-journal-verify.log`. Webbchunkens varning kvarstår vid cirka 572 kB före gzip. Ingen agent eller provider startades i de nya proven.

13/46 fullständiga acceptansscenarier är fortsatt lokalt godkända. Explicit kvittohantering i återställda profiler, äldre körningar utan kvitto, fjärrhändelsers identiteter, oklara externa utfall och strömavbrott återstår. Den nya migrationen och körvägen har inte provats i en ny paketerad Windows-artefakt. R1–R4 är öppna; ingen merge eller publicering kördes. Följande avsnitt är historiska kontrollpunkter.

## Automationer vid nekad lagring

Automationers skapa/ändra/ta bort och körningshistorik uppdaterar nu minnet först efter lyckad lagring. Nekad filersättning behåller föregående sparade tillstånd. Om en körning redan skapats men dess automationshistorik inte kan sparas visar felet körnings-ID och motorn stoppar fler manuella, schemalagda och händelsestyrda starter i den sessionen. Den felaktiga beskrivningen att en sådan körning ”skippats” är borttagen.

16 riktade tester passerade, inklusive injicerad rename-nekning och ett riktigt Windows-filhandtag som tillåter läsning men blockerar ersättning. Hela `npm run verify` passerade med 372 tester i 81 filer, typkontroll, lint och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. Webbchunkens varning kvarstår vid cirka 572 kB före gzip. Loggar: `controlos-automation-persistence-focused.log` och `controlos-automation-persistence-verify.log`. Det tidigare intermittenta filfelets exakta orsak är fortfarande okänd; inga automatiska återförsök eller försvagade skrivkontroller infördes.

Skyddet efter misslyckad historiklagring gäller ännu endast sessionen. Beständigt automationsuppdrag, stabil dispatchidentitet och avstämning över omstart återstår. Detta godkänner inte full T35 eller R1. 13/46 fullständiga scenarier är fortsatt lokalt godkända. Den tidigare paketerade artefaktens bevis gäller dess registrerade källhashar, inte dessa nya automationsändringar. [Kontrakt, tester och begränsningar](docs/controlos/automation-persistence.md). Följande avsnitt är historiska kontrollpunkter.

## Återställningsbindning och paketerad omprovning

Återställda databaser har nu en egen identitet som måste matcha återställningsfilen före normal uppstart. Saknad, utbytt eller nedgraderad fil stoppar uppstart. Kopierade databasbytes kontrollsummeras innan databasen får sitt slutliga namn; avbruten kopiering lämnar en blockerad stagingfil. Befintliga äldre återställningsfiler registreras vid första uppstart. Skyddet kan inte identifiera äldre återställningar vars enda märke redan har raderats, och är ingen säkerhetsgräns mot samma OS-användare.

Den riktiga osignerade Windows-appen har provats med syntetiska profiler: två återställningsstarter, nekad start med saknat märke och oförändrade databasbytes samt tre starter för äldre profilmigrering/återöppning. Provet upptäckte att Electron tidigare rapporterade exitkod 0 vid nekad uppstart; slutartefakten rapporterar nu exitkod 1. [Käll- och artefaktbundna bevis](docs/controlos/restore-binding-evidence.json).

Slutlig typkontroll, lint och separat full byggning passerade. Full regression passerade 368 av 369 tester; automationstestets atomiska filbyte nekades med Windows `EPERM`. Separat omprov av samtliga 13 automationstester passerade utan kodändring. Detta räknas inte som en helt grön `npm run verify`. Orsaken till Windows nekade filbyte är inte fastställd. Återställningens 11 riktade tester passerade. Loggar: `controlos-binding-final-verify.log`, `controlos-binding-automation-recheck.log`, `controlos-binding-final-build.log`, `controlos-binding-packaged-final.log` och `controlos-binding-packaged-migration.log`.

13/46 fullständiga scenarier är fortsatt lokalt godkända. R1–R4 är öppna; verklig användarprofil, installer/uppdatering, full sandbox och provider-/nyttopilot återstår. Ingen modell, pilotagent, merge eller publicering kördes. Följande avsnitt är historiska kontrollpunkter.

## OpenShip-inspirerad design och beständig kö

OpenShip har granskats på revision `fc60144ddb0312ff88502e6e660141238a616951`: faktisk dashboardbild, temaregler, navigation och beskriven arkitektur. ControlOS har nu en neutral ljus standardvy, sparat mörkt läge, tydligare typografi, fristående sidomenyer och kvarvarande navigation på undersidor. Smala datorfönster får kompakt sökning och färre Ops-kolumner så att projektidentiteter förblir läsbara. Inga externa komponenter, logotyper, beroenden eller deploymentfunktioner har kopierats. [Granskning och avgränsning](docs/controlos/openship-design-review.md).

Versionerade köjobb bevaras nu vid normal avstängning. Återställning har ett separat granskningsflöde för att uttryckligen avbryta säkert registrerade, ännu inte startade jobb. Aktuell innehållsdigest och texten `CANCEL QUEUED JOB` krävs. Körningsrad, kopplad uppgift, uppgiftsrevision, byggstatus och revisionshändelse ändras atomiskt; gamla processer, verifieringar och lås får inte rensas genom flödet. Transaktionsfel rullar tillbaka allt och upprepad begäran skapar ingen dubblett. [Återställningskontrakt](docs/controlos/profile-recovery.md).

`npm run verify` har passerat med typkontroll, lint, samtliga 365 tester i 78 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. Utökad browser-smoke passerar vid 390/1024/1280/1536 px, inklusive sparat temaval, tangentbordsstyrning, läsbara projektidentiteter, parning, återställning och uppgiftsgranskning. Normal text och primärknappar klarar den automatiska kontrastkontrollen i båda paletterna. Bilderna har granskats och använder uttryckligen demodata. Webbchunkens varning kvarstår vid cirka 572 kB före gzip.

Tidigare försök räknas inte som godkända: den första långa körningen blandade källrevisioner och hade tidsgränsfel samt ett föråldrat test som krävde att shutdown avbröt kön. En senare full körning passerade 364/365 tester; ett riktigt Windows-stopp hann inte inom testets korta standardpollning. Efter uttrycklig ti sekunders pollgräns passerade både riktat prov och samtliga 365 tester i den slutliga körningen. Testet med flera isolerade Git-jämförelser har nu en totalgräns på 120 sekunder. Produktskydd och verifierade postvillkor har behållits. Visuell kontroll hittade och korrigerade överströmmande toppmeny och ihoptryckta Ops-rader vid 1024 px; en särskild layoutregression täcker detta.

13/46 fullständiga scenarier är fortsatt lokalt godkända; R1–R4-grindarna är öppna. Verklig användarprofil, paketerad omprovning av dessa ändringar, installer/uppdatering, sandbox, provider- och nyttopilot återstår. Ingen modell, pilotagent, merge eller publicering kördes. Loggar och bilder är ignorerade lokala artefakter: `controlos-openship-final-verify.log`, `controlos-openship-layout-smoke.log`, `controlos-openship-layout-typecheck.log`, `controlos-openship-layout-lint.log` och `smoke-shots/`. Följande avsnitt är historiska kontrollpunkter.

## R4: uttrycklig övergång till manuell drift

Återställda profiler utan olösta blockerare kan nu granskas för manuell drift. En fem minuter giltig engångsbekräftelse binds till aktuella körningar, verifieringar, lås, referenser, innehållsjämförelser och profilens JSON-filer. Användaren måste skriva `ENABLE MANUAL OPERATION`; servern kontrollerar allt på nytt och vägrar ändrat underlag. Godkännandet sparas med filidentitets-/innehållskontroll, flush och rename. Den gamla sessionen förblir spärrad tills samma profil startas om, även om webbsidan laddas om under tiden.

Köade/körande gamla jobb, pågående verifieringar, kvarhållna lås, registrerat osäkert processavslut och otillräckliga referens-/innehållsbevis stoppar aktivering. Flödet tar inte bort sådana poster eller lås. Efter godkänd omstart kan användaren arbeta med planering och inställningar. Startup-scanning, schemalagd/händelsestyrd automation och automatisk desktop-uppdatering förblir avstängda. Nya köjobb väntar efter senare omstarter på en slutförd uttrycklig projektskanning, utan att markeras misslyckade bara för att scanner ännu saknas.

`npm run verify` passerade: typkontroll, lint, 362 tester i 77 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. De sista förtydligandena av scannergrinden, osäkert processavslut och omstartsbesked passerade därefter full typkontroll, riktad lint och båda återställnings-/aktiveringstesterna. Testet använder isolerade profiler; dess borttagning av syntetiska blockerande rader skapar en separat ledig fixture och är ingen produktfunktion. [Återställningsflöde och begränsningar](docs/controlos/profile-recovery.md).

13 av 46 fullständiga scenarier är fortsatt lokalt godkända. Fulla R1–R4-grindar är öppna. Flöden för att lösa gamla jobb/lås eller återbinda saknade referenser återstår, liksom verklig användarprofil och installer/uppdatering. Paketerad desktop har inte provats på nytt med aktivering. Ingen modell, pilotagent, merge eller publicering kördes. Följande avsnitt är historiska kontrollpunkter.

Hela browser-smoke passerade med blockerad respektive uttryckligt godkänd aktivering vid 1536/390 px; mobilbilden har granskats. En sista regression med konfigurerad syntetisk Anthropic-nyckel bekräftar att incidenter i återställd manuell drift inte gör automatiska modellanrop. Riktade tester, lint och slutbygge passerade efter detta skydd. Loggar: `controlos-recovery-activation-verify.log`, `controlos-recovery-activation-final-checks.log`, `controlos-recovery-activation-smoke.log`, `controlos-recovery-activation-provider-check.log` och `controlos-recovery-activation-final-build.log` (ignorerade).

## R4: passiv jämförelse av återställt resultatinnehåll

Återställningsrapporten kan nu jämföra en körnings sparade Git-revision och innehållshash med den kvarvarande arbetskopian. Matchning, avvikelse, otillgänglig jämförelse och saknat historiskt underlag visas separat. API:t kräver återställningsläge och autentisering och kör högst en jämförelse åt gången. Inga verifieringsposter, godkännanden, körningsrader eller lås ändras.

Jämförelsen använder en temporär Git-läsvy med kopierat index, observerad HEAD, lokal objektreferens och en begränsad lista icke-exekverbara inställningar. Projektets filter, fsmonitor, hooks, remotes och globala konfiguration följer inte med. Extern diff/textconv och nätverksprotokoll spärras; submoduler kräver separat granskning. Provet använder riktiga filter-/fsmonitor-/extern-diff-markörer som inte får köras, binära filer och ett ospårat filnamn med inledande blanksteg. Index, konfiguration och körningsrader bevaras. [Kontrakt och begränsningar](docs/controlos/profile-recovery.md).

`npm run verify` passerade med typkontroll, lint, 361 tester i 76 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. Detta är en innehållsobservation enligt befintligt hashkontrakt, inte en ny verifiering av projektet eller en atomisk filsystemsbild. Ignorerade filer ingår inte; konfigurationsberoende skillnader kan kräva manuell granskning. Paketerad desktop har inte provats på nytt med just denna tilläggsfunktion.

13 av 46 fullständiga scenarier är fortsatt lokalt godkända. Fulla R1–R4-grindar är öppna. Stödd återaktivering, verklig användarprofil och installer/uppdatering återstår. Ingen modell, pilotagent, merge eller publicering kördes. Följande avsnitt är historiska kontrollpunkter.

Hela browser-smoke passerade med uttryckliga jämförelsefixturer vid 1536/390 px. Mobilbilden har granskats. Loggar: `controlos-recovery-content-focused.log`, `controlos-recovery-content-typecheck.log`, `controlos-recovery-content-verify.log` och `controlos-recovery-content-smoke.log` (ignorerade). Webbchunkens varning kvarstår vid cirka 563 kB före gzip.

## R4: referensgranskning och återställd paketerad app

Granskningsläget kan nu kontrollera registrerade arbetskopior, körningsresultatens sökvägar och verifieringsarbetskopior. Rapporten skiljer matchande filidentitet från saknade, utbytta, främmande eller otillräckligt dokumenterade referenser. Den kör inga Git-kommandon eller agenter och ändrar inga referenser eller lås. Filinnehåll och processavslut är uttryckligen overifierade; rapporten aktiverar inte profilen. Återställd aktivitet märks som historik, inte som bevis på levande processer.

En separat syntetisk profil har säkerhetskopierats, återställts och öppnats två gånger i den riktiga unpacked Windows-appen. Projekt/repo/checkout, plan, köade och körande poster samt lås bevarades exakt. Riktig renderer/preload, API-behörigheter, referenspanel, nekad mutation, utelämnade providercredentials, SQLite-integritet och främmande nycklar kontrollerades. Arbetskopians osparade fil och Git-index bevarades. Alla ägda appstarter stängdes normalt; efteråt fanns inga processer med den provade exe-sökvägen. [Prov och begränsningar](docs/controlos/profile-recovery.md), [käll- och artefakthashar](docs/controlos/packaged-restore-evidence.json).

`npm run verify` passerade: typkontroll, lint, 360 tester i 75 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. Hela browser-smoke passerade, inklusive uttryckliga referensfixturer vid 1536/390 px; bilderna har granskats. Det slutliga paketerade provet passerade separat lint och två appstarter på Electron 44.4.5 / Node 24.21.0. Loggar: `controlos-recovery-references-focused.log`, `controlos-recovery-references-verify.log`, `controlos-recovery-references-smoke.log`, `controlos-packaged-restore.log` och `controlos-packaged-restore-lint.log` (ignorerade). Misslyckade tidiga prov och deras korrigeringar redovisas i provbeskrivningen.

13 av 46 fullständiga scenarier är fortsatt lokalt godkända. T36 och fulla R1–R4-grindar är öppna. Verklig användarprofil, full innehållsåterställning, installer/uppdatering och stödd återaktivering återstår. Paketeringen är osignerad. Ingen modell, pilotagent, merge eller publicering kördes. Följande avsnitt är historiska kontrollpunkter.

## R4: återställning till beständigt granskningsläge

Backupmanifest version 2 utelämnar anslutningsfilen och desktops åtkomstnyckel och kontrollerar SHA-256 för databas och inkluderade konfigurationsfiler. Äldre manifest kan återställas men deras anslutningsfil kopieras inte. En befintlig backup med samma namn bevaras. Återställning kräver en ny katalog och kontrollerar SQLite-integritet och främmande nycklar.

Återställda profiler öppnas nu i ett beständigt granskningsläge. Köjobb startas inte, gamla körningar och lås omklassificeras inte, bakgrundssystem och scanners startas inte och skrivande API-anrop spärras. Browser-parning och läsning fungerar. Desktop hoppar över uppdateringskontrollen och webbgränssnittet visar en varning. Ett avbrutet eller trasigt återställningsmärke stoppar uppstart. Se [återställningskontrakt och begränsningar](docs/controlos/profile-recovery.md).

`npm run verify` passerade med typkontroll, lint, 359 tester i 74 filer och byggning på Windows x64 / Node 22.18.0 / npm 11.7.0. Det nya integrationstestet återställer en riktig temporär SQLite-profil och öppnar den två gånger med systemstart begärd: inga processer startas, gamla körningsrader och lås bevaras och mutationer nekas.

13 av 46 fullständiga scenarier är fortsatt lokalt godkända. T36 är öppet: granskning av lokala arbetskopior/resultatreferenser, verklig användarprofil och en stödd övergång tillbaka till aktiv drift återstår. Databasen kan fortfarande innehålla känslig användarskriven historik; detta är ingen generell hemlighetsrensning. Ingen modell, pilotagent, merge, publicering eller installer kördes. Följande avsnitt är historiska kontrollpunkter.

Hela `npm run smoke` passerade, inklusive uttryckliga återställningsfixturer vid 1536/390 px; bilderna har granskats. Loggar: `controlos-restore-review-focused.log`, `controlos-restore-review-verify.log` och `controlos-restore-review-smoke.log` (ignorerade). Desktopändringen är typkontrollerad och byggd men den paketerade appen har inte provats på nytt för denna ändring. Chunkvarningen kvarstår vid cirka 560 kB före gzip.

## R1/R4: riktig paketerad desktop med syntetisk äldre profil

En separat käll- och beroendekopia från `6457efb` plus de dokumenterade källändringarna har byggts till en riktig Windows x64 Electron-artefakt utan publicering. SQLite byggdes för Electron i den kopian; utvecklingsmiljöns Node-modul bevarades. Appen har startats tre gånger med egen userData/sessionData, isolerade Windows app-data-kataloger, dold vy och avstängd uppdateringskontroll. Nya explicita startval är `--profile-dir=<absolut sökväg>`, `--hidden` och `--no-update-check`; standardstarten är oförändrad.

Provet använder en temporär profil med schema till migration 0008, historiskt accepterad körning, egen prompt, avstängd agentpolicy och syntetiska nycklar. Appens riktiga preload, API, paketerade migrationsfiler, SQLite-modul och DPAPI-hjälpare används. Klartext migreras, därefter skapas riktiga äldre Electron-ciphertexter i samma profil som migreras vid nästa start. Tredje starten återöppnar DPAPI-profilen. Historiska körfält och prompt-/policybytes bevaras, inga gamla approvals uppfinns och SQLite integrity_check passerar efter varje normal avstängning. Se [reproducerbart prov och artefakthashar](docs/controlos/packaged-profile.md).

Första körningen hittade en verklig avstängningslåsning: servern väntade på HTTP-stängning medan desktopfönstret höll SSE öppen. Servern stänger nu sina strömmar och nekar nya innan den väntar på avstängning. Ett nätverksprov reproducerar och kontrollerar beteendet. Den låsta första testprocessen avslutades uttryckligen och räknas inte som godkänd. Ett första HTTP-test hade fel Host-header; fixturen rättades utan undantag i produktskyddet. Därefter passerade både det riktade provet och paketerad migrering/återöppning med tidsgräns för avstängning.

`npm run verify` passerade: typkontroll, lint, 357 tester i 73 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Hela `npm run smoke` passerade. Den slutliga utökningen av migreringsprovet passerade riktad lint och alla tre riktiga appstarter. Paketerad runtime: Electron 44.4.5/Node 24.21.0. Windows signaturkontroll: NotSigned. Loggar: `controlos-packaged-profile-verify.log`, `controlos-packaged-profile-smoke.log`, `controlos-packaged-profile-legacy.log` och föregående `controlos-package-*.log` (ignorerade). Temporära testartefakter och profiler har behållits separat.

13 av 46 fullständiga scenarier är fortsatt lokalt godkända. Detta är en unpacked paketerad app med syntetisk profil, inte NSIS-installation, uppdatering/rollback, verklig användarprofil eller full migrations-/kraschmatris. Fulla R1–R4-grindar är öppna. Ingen modell, pilotagent, merge eller publicering kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: gemensam runtimekontroll och versionsbunden installationsstatus

Setup och serverstart delar nu versionsregeln i `packages/shared/src/runtime.ts`: Node 22.18+ i 22-serien eller 24.11+. Felaktiga och förhandsversioner nekas. Setup läser den körande serverns runtime, inklusive Electron, i stället för att prova en annan Node-binär på PATH. En äldre version visas som åtgärdskrävande och får inte Ready-status. Den tidigare guiden för Node 20 har ersatts med projektets provade lägstanivå. Kontrollen gäller inte automatiskt andra byggskal eller providerprocesser.

Setup och README skiljer nu release-definitionen från bevis på publicerad installer, signering och uppdateringsmigrering. Länken visar releases utan att påstå att en viss installer är verifierad. Installationskortets mobilradbrytning har också rättats. Nästa större desktopsteg är provning av den paketerade appen och en separat full profil; detta genomfördes inte i denna etapp.

`npm run verify` passerade: typkontroll, lint, 355 tester i 71 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Hela `npm run smoke` passerade med en uttrycklig DEMO-fixture för nekad Node 22.12 och installationsstatus vid 1536/390 px. Bilderna har granskats. Loggar: `controlos-setup-runtime-focused.log`, `controlos-setup-runtime-verify.log` och `controlos-setup-runtime-smoke.log` (ignorerade). Chunkvarningen kvarstår, cirka 560 kB före gzip.

13 av 46 fullständiga scenarier är fortsatt lokalt godkända. Fulla R1–R4-grindar är öppna. Ingen modell, pilotagent, merge, publicering eller installer kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: verifieringsstatus även i Setup

Setup räknar inte längre en sparad GitHub-nyckel som installerad/redo. Konfigurerad, nyligen verifierad, nekad, utgången och otillgänglig verifiering hålls isär. Varje Setup-svar läser anslutningsstatus på nytt; cache för maskinens verktyg kan inte hålla kvar ett gammalt grönt anslutningsresultat. Vyn hämtar lokal status var 15:e sekund och vid fokus utan automatisk providerverifiering. Verifierat betyder endast godkänt credential vid det stödda anropet, inte verifierade repobehörigheter. Setup anger också runtime-parning i stället för att lägga åtkomstnyckeln i webbbygget.

Ett API-prov använder sparad syntetisk nyckel och injicerade 401/200-svar för att kontrollera konfigurerad → nekad → verifierad, utan provideranrop vid Setup-läsning. Omstart behåller konfigurationen men tar bort autentiseringen. Riktade prov och `npm run verify` passerade: typkontroll, lint, 354 tester i 71 filer samt byggning på Windows x64, Node 22.18.0/npm 11.7.0. Hela `npm run smoke` passerade, inklusive fokusuppdatering från verifierad till utgången vid 1536/390 px. Bilderna har granskats och är DEMO-fixtures. Loggar: `controlos-setup-auth-focused.log`, `controlos-setup-auth-verify.log` och `controlos-setup-auth-smoke.log` (ignorerade). Se [verifieringskontraktet](docs/controlos/connection-verification.md).

13 av 46 fullständiga scenarier är fortsatt lokalt godkända. T25 saknar fortfarande verkligt utgånget credential-prov; injicerade svar ersätter inte det. Fulla R1–R4-grindar är öppna. Browsergranskningen identifierade även föråldrade Node- och installationsuppgifter i Setup, vilka behöver rättas i nästa steg. Ingen modell, pilotagent, merge eller deploy kördes. Chunkvarningen kvarstår, cirka 560 kB före gzip. Följande avsnitt är historiska kontrollpunkter.

## R1: bevara anslutningslagret vid korruption och nekad läsning

Anslutningslagret kontrolleras före SQLite-start och sparar identitet/innehållshash för filen som lästes. En redan öppen instans vägrar skriva över en senare ändrad, raderad, utbytt, länkad eller oläsbar fil. Nya bytes flushas till en privat temporär fil och ursprunget kontrolleras igen före rename. Nekad uppdatering och frånkoppling bevarar även minnesvärdet. Fel visar en återställningsväg utan att återge korrupt JSON eller hemligheter. Se [lagringskontraktet](docs/controlos/native-credentials.md).

T24 provas med riktig korruption och en separat PowerShell-process som håller ett exklusivt Windows-filhandtag. Serverstart nekas innan databasen skapas; efter tidigare lyckad start nekas sparning/radering via autentiserade API-anrop och filen förblir oförändrad. Upplåsning tillåter åter normal sparning. Browserprovet visar motsvarande fel efter både uppdatering och frånkoppling vid 1536/390 px; bilderna har granskats och använder DEMO-data.

`npm run verify` passerade: typkontroll, lint, 353 tester i 70 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Efter klientens lilla rättning av frånkopplingsfelet passerade webbtypkontroll, riktad lint och hela `npm run smoke`. Det första browserprovet flaggade avsiktliga HTTP 400-fixtures; slutprovet räknar exakt fyra sådana svar och behåller felkontrollen för andra fel. `npm run smoke:native-profile` passerade också i fem separata Electron 44.4.5-processer. Loggar: `controlos-connection-preservation-verify.log`, `controlos-connection-web-check.log`, `controlos-connection-preservation-final-smoke.log` och `controlos-connection-native-profile.log` (ignorerade).

T24 är lokalt godkänt: 13 av 46 scenarier är nu verifierade och 33 återstår. Filkontrollen är optimistisk konfliktdetektering, inte en atomisk transaktion mellan flera appinstanser eller en OS-sandbox. Full profilmigrering, installeruppdatering och övriga R1–R4-grindar är fortfarande öppna. Ingen modell, pilotagent, merge eller deploy kördes. Chunkvarningen kvarstår. Följande avsnitt är historiska kontrollpunkter.

## R1: beständig arbetskopietyp och kontroll av utbytt resultat

Migration 0018 sparar nya arbetskopior som `isolated_clone` tillsammans med deras fysiska Git-identitet. Typ, identitet, sökväg, basrevision och branch låses efter registrering. Ofullständig proveniens och en isolerad kopia med originalets identitet nekas av databasen. Historiska rader får ingen gissad klassificering: API och körhistorik visar att typen inte är registrerad. Den privata identiteten lämnas inte ut av API:t.

Startkontroller, resultatets innehållskontroll, verifiering och acceptans jämför den registrerade identiteten. Ett nytt prov ersätter resultatets repo med en annan kopia med exakt samma commit och innehåll. Acceptans och ny verifiering nekas ändå, tidigare grönt resultat återkallas och ingen andra verifieringsprocess startas. API-provet kontrollerar även bevarad typ efter omstart. Se [kontraktet](docs/controlos/task-execution.md).

`npm run verify` passerade med typkontroll, lint, 350 tester i 69 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Hela `npm run smoke` passerade. De fyra nya bilderna för registrerad/okänd typ vid 1536/390 px har granskats; browserproven använder DEMO-data. Loggar: `controlos-workspace-provenance-verify.log` och `controlos-workspace-provenance-smoke.log` (ignorerade). Ett inledande testförsök förväntade fel databasfel vid ofullständig radering; fixturen rättades och slutproven passerade. Chunkvarningen kvarstår, cirka 559 kB före gzip.

12 av 46 fullständiga scenarier är fortsatt lokalt godkända. Identitetskontroller är ingen OS-sandbox eller atomisk spärr mot filsystemsändringar av samma användare. Native-hjälpprocesser, profilmigrering och sandboxgränser återstår inom R1; fulla R1–R4-grindar är öppna. Ingen modell, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: fristående Git-resultat och bevarat original

Nya körningar skapas nu i egna Git-repon från den granskade committen. Git-objekt överförs utan worktree-registrering, delade refs, objektalternates eller installation av originalets hooks/remotes/config. Endast effektivt författarnamn och e-post kopieras. Förberedelsen stänger av globala/systeminställningar och hookmallar i målet, ignorerar ärvda Git-miljööverstyrningar och undviker frivillig indexuppdatering i källan. Ändrad HEAD under förberedelsen stoppar jobbet.

Granskade uppgiftskörningar kan använda sin valda commit när originalet har lokala ändringar. Vyn anger uttryckligen att dessa ändringar inte följer med och lämnas kvar. Vanlig promptdispatch utan granskad bas nekar fortfarande smutsig källa. Ingen stash, reset eller clean införs. Migration 0017 sparar originalets fysiska Git-identitet vid claim och gör den oföränderlig. Agent- och verifieringslås kontrollerar både källa och resultat, så nya separata metadata inte öppnar för parallella syskonskrivare. Historiska resultat och lås flyttas inte. Se [kontraktet](docs/controlos/task-execution.md).

T13-provet kör och avbryter en verklig lokal process medan originalet har staged och unstaged ändringar, en untracked binärfil, eget branchval och egna hooks/config. Rekursiva innehålls-/modekontroller av hela originalet inklusive `.git` är identiska före, under och efter körningen. Agentens ändring finns kvar i resultatet, vars Git-identitet är separat. Även den beständiga källidentitetens skrivskydd och verifieringskarantän mot originalets syskon provas.

Slutlig `npm run verify` passerade: typkontroll, lint, 349 tester i 68 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Tre äldre migreringsfixtures behövde uttrycklig SQL för sitt gamla schema; slutproven visar bevarade historiska rader med null källidentitet. Hela `npm run smoke` passerade vid 1536/390 px och de uppdaterade granskningsbilderna har granskats. Browserkörningarna är DEMO-fixtures. Slutloggar: `controlos-isolated-repo-final-verify.log` och `controlos-isolated-repo-smoke.log` (ignorerade); tidigare fel och riktade prov finns i övriga `controlos-isolated-repo-*.log`. Chunkvarningen kvarstår, cirka 559 kB före gzip.

T13 är lokalt godkänt: 12 av 46 scenarier är nu godkända och 34 ännu inte fullständigt provade. Samma OS-användare kan fortfarande nå andra filer; detta är ingen OS-sandbox. Historiska worktrees kan fortfarande dela metadata. Explicit arbetskopietyp/proveniens i körningsregistret, återstående native-hjälpprocesser, profilmigrering och sandboxgränser behöver fortsatt arbete. Fulla R1–R4-grindar är öppna. Ingen modell, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: avstämning efter verklig native-processstart och serverkrasch

T16:s native-prov omfattar nu både saknat och tillgängligt stoppbevis efter en faktisk ägarkrasch. En separat process startar ett riktigt Windows Job Object med en Node-process och dess barn, sparar identiteten och avslutas abrupt innan körningens slutstatus skrivits. Vid återöppning hålls det faktiska native-kvittot först undan. Körningen blir uttryckligen avbruten/osäker, samma identitet och låsägare bevaras och nästa köade jobb startar inte. Att de gamla PID:erna har försvunnit räcker inte för upplåsning.

När exakt samma autentiserade native-kvitto återställs kan återhämtningen släppa det gamla låset. Ett enda nytt native-ägt jobb startar under ett nytt ägarskap; den avbrutna körningen återstartas inte och förblir misslyckad. Kompletterande prov nekar fel signatur/identitet och behåller låset vid transaktionsfel. Se [processkontraktet](docs/controlos/native-process-host.md). Dokumentationen skiljer också uttryckligen mellan frigjord lokal controllerplats och kvarhållen beständig profilkapacitet.

Sex riktade tester i tre filer passerade på Windows x64, Node 22.18.0/npm 11.7.0. Servertypkontroll och riktad lint passerade. Loggar: `controlos-post-spawn-focused.log`, `controlos-post-spawn-types.log` och `controlos-post-spawn-lint.log` (ignorerade). Denna ändring gäller testbevis och dokumentation; produkt- och webbkoden är oförändrade. Senaste fulla verifieringen är 348 tester och byggning vid `88c7990`, och senaste browserkontrollen hör till `e94925d`.

T16 är lokalt godkänt: totalt 11 av 46 scenarier, med 35 fortfarande inte fullständigt provade. T16-beviset omfattar den egna Windows Job Object-gränsen; det påstår inte framtvingad OS-återanvändning av PID, POSIX-attestering, brokerprocesser eller fil-/nätverkssandbox. Kraschen före sparad processidentitet kan fortfarande kräva permanent karantän. Fulla R1–R4-grindar är öppna. Nästa ändring gäller originalarbetskopians filer och Git-metadata. Ingen modell, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: kvitterad köpost vid serverkrasch, återförsök och avstängd dispatch

T15 har nu ett prov med en separat lyssnande HTTP-server. Ett injicerat fel hindrar claim-transaktionen efter accepterad köläggning. Testet tar emot serverns svar, kontrollerar att posten är köad utan processstart och avslutar sedan serverprocessen utan normal nedstängning. En ny server läser den temporära profilen, tar samma post under ett nytt beständigt ägarskap och startar exakt en riktig lokal Node-process. Ännu en återöppning skapar ingen dubblett. Detta gäller den provade punkten före claim/spawn; strömavbrott och övriga kraschpunkter omfattas inte.

T17/T19 provas genom API-anrop: identiska samtidiga begäranden ger samma körnings-ID, ändrad uppgift/modell/provider ger 409, och ett väntande jobb startas inte när dispatch stängs av före ledig plats. Efter återöppning returnerar identiska återförsök de gamla ID:na utan ny körning, medan en ny begäran nekas av den sparade policyn. Originalets arbetsfiler lämnas oförändrade; detta är inte T13:s fulla Git-metadataacceptans.

Återhämtningen hoppar nu över jobb som samma controller redan kör, så en upprepad kontroll inte felmarkerar dem som övergivna. En separat injicerbar scannerinställning låter integrationsprovet läsa endast sin temporära profil vid start utan att aktivera system- eller externa integrationer. Normalt startbeteende är oförändrat. Se [kontrakt och avgränsningar](docs/controlos/task-execution.md).

Slutlig `npm run verify` passerade med typkontroll, lint, 348 tester i 68 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Riktade prov passerade också. De första testförsöken hade fel port, escaping, utebliven testscanning och ospecificerade JSON-svarstyper; rättningarna och slutresultatet finns i ignorerade `controlos-dispatch-acceptance-*.log`. Slutloggarna är `controlos-dispatch-acceptance-final-focused.log` och `controlos-dispatch-acceptance-final-verify.log`. Webbkod och browserprov är oförändrade; senaste fulla browserkontroll hör till `e94925d`. Chunkvarningen kvarstår, cirka 559 kB före gzip.

T15/T17/T19 är lokalt godkända med versionsbundna källhashar. Totalt är 10 av 46 scenarier lokalt godkända och 36 ännu inte fullständigt provade. Fulla R1–R4-grindar är öppna. Nästa R1-granskning gäller krasch efter spawn och originalarbetskopians Git-metadata, därefter återstående native- och sandboxgränser. Ingen riktig modell, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: beständig gemensam kapacitet för skrivarjobb

Agentjobb, verifieringar och kvarhållna karantänlås räknas nu mot samma gräns om två skrivarägarskap per profil. Migration 0016 nekar ett tredje lås i SQLite även vid konkurrerande anslutningar. Köval och claim kontrollerar också gränsen. Ett tappat processhandtag eller en omstart frigör därmed ingen kapacitet utan att det befintliga ägarskapet kan hävas. En äldre profil med fler lås bevaras och nekar nya skrivare tills färre än två återstår. Gränsen avser jobb i denna profil, inte antalet underprocesser eller externa program.

Verifiering utan kapacitet nekas innan ett försök skapas eller tidigare verifiering/acceptans återkallas. Bekräftad frigöring väcker agentkön. Körhistoriken visar att aktiva eller karantänlagda skrivare upptar profilens kapacitet. Se [körkontraktet](docs/controlos/task-execution.md) och [verifieringsägarskapet](docs/controlos/verification-processes.md).

`npm run verify` passerade: typkontroll, lint, 346 tester i 67 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Nya prov omfattar två verkliga processer med borttappade handtag, fortsatt spärr efter återöppning, blandat verifierings-/agentägarskap, bevarade tidigare resultat vid kapacitetsavslag, migrering av tre gamla karantänlås och två separata processer som tävlar om sista platsen med rollback för förloraren. Loggar: `controlos-capacity-focused.log`, `controlos-capacity-race.log` och `controlos-capacity-verify.log` (ignorerade).

Det första browserprovet underkändes av Chromium `ERR_NO_BUFFER_SPACE` efter genomförda flöden. Felrapporteringen har kompletterats med resursadress utan query. Därefter passerade riktad lint och hela browserprovet i `controlos-capacity-final-smoke.log`; inga produktundantag infördes. De nya 1536/390-bilderna har granskats. Browserkörningarna är uttryckliga DEMO-fixtures. Webbens chunkvarning kvarstår, cirka 559 kB före gzip.

T12 är lokalt godkänt för den dokumenterade Windows-profilen. Totalt är 7 av 46 fullständiga acceptansscenarier lokalt godkända och 39 fortfarande inte fullständigt provade. Fulla R1–R4-grindar är öppna. Nästa del gäller kvitterad köpost vid faktisk serverkrasch, dubbla API-anrop och omprövad policy före start. Native-fönstret före sparad processidentitet, sandbox, andra hjälpprocesser och verklig pilot återstår. Ingen riktig modell, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: köorsaker, syskon-worktrees och atomisk felstatus

Körningen, uppgiftens felstatus och agentens synliga felhändelse sparas nu i samma transaktion. Ett injicerat fel vid lagring av agenthändelsen lämnar samtliga tillstånd oförändrade och behåller skrivlåset; återhämtning kan sedan spara hela övergången. Oregistrerade Git-worktrees jämförs också genom sin verkliga gemensamma Git-katalog, så olika scanner-ID:n inte ger parallella skrivare i samma repo.

Agentkön har två platser som standard. API och körhistorik visar aktuella vänteskäl för repolås respektive full kapacitet. Både listan och detaljvyn uppdateras medan jobb väntar eller körs. Ett nytt API-prov använder riktiga Node-processer och temporära Git-worktrees för exklusivitet, kapacitetsgräns, köframflyttning och återöppnad profil utan omkörning. Se [körkontraktet](docs/controlos/task-execution.md).

`npm run verify` passerade med typkontroll, lint, 342 tester i 66 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Hela `npm run smoke` passerade, inklusive ändrade vänteskäl och queued/running/done utan omladdning vid 1536/390 px. De fyra nya bilderna har granskats; browserprovet använder uttryckliga DEMO-fixtures. Loggar: `controlos-queue-matrix-focused.log`, `controlos-queue-matrix-verify.log` och `controlos-queue-matrix-smoke.log` (ignorerade). Webbens chunkvarning kvarstår, cirka 559 kB före gzip.

T12 hålls öppet: normalfallet är provat, men den globala startgränsen behöver också räkna beständiga karantänlås och verifieringsägarskap. Den nuvarande räknaren gäller agentkontrollerns aktiva jobb; en okänd process kan överleva sin frigjorda kontrollplats. Detta är nästa avgränsade R1-ändring. Fortfarande är 6 av 46 fullständiga acceptansscenarier lokalt godkända, och inga fulla R1–R4-grindar är klara. Ingen riktig modell, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: osäkert adapterfel före returnerat processhandtag

Agentmotorn markerar nu processutfallet som osäkert före anropet till processadaptern. Om adaptern skapar en process och sedan kastar ett fel behålls det beständiga repolåset, även om motorn aldrig fick processhandtaget. Körkapaciteten frigörs för andra repon. Vid omstart får även avbrutna körningar utan sparad processidentitet uttrycklig status `unconfirmed`; avsaknad av metadata räknas inte som stoppbevis.

Endast ett uttryckligt `ProcessNotStartedError` från förkontroll före OS-processkapande får frigöra ägarskapet direkt. Klassen används för saknad providerexekverbar, ogiltiga absoluta körvägar och fel när kvittokatalogen förbereds. Vanliga adapter-, spawn-, protokoll- och strömfel får inte klassas om till detta. Verifieraren använder samma åtskillnad. Se [processkontraktet](docs/controlos/native-process-host.md).

`npm run verify` passerade: typkontroll, lint, 340 tester i 65 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Ett nytt prov startar en riktig Node-process och kastar bort handtaget: nästa uppdrag i samma repo väntar, ett oberoende repo körs och återöppnad databas behåller karantänen. Även när testet stoppar sin egen process vägrar produktens återhämtning att gissa utifrån PID eller saknat handtag. Förkontrollfallen och återhämtning före sparad identitet provas separat. Loggar: `controlos-spawn-boundary-focused.log` och `controlos-spawn-boundary-verify.log` (ignorerade). Browservyerna är oförändrade; senaste fulla browserprovet hör till `f4e4221`.

6 av 46 fullständiga acceptansscenarier är fortfarande lokalt godkända. Nästa R1-kontroll gäller kö- och kraschmatrisen: vänteskäl, oregistrerade syskon-worktrees och atomisk lagring av agentens synliga terminalstatus även i felvägen. Native-fönstret före beständig processidentitet/reservation kan fortfarande lämna karantän; ingen automatisk upplåsning eller full R1–R4-grind påstås vara klar. Följande avsnitt är historiska kontrollpunkter.

## R1: beständigt ägarskap för verifieringsprocesser

Verifieringskommandon tar nu beständiga repolås före förkontroll och spawn. Varje försök sparar oföränderligt mål, kommando och processidentitet. Agentkö och verifierare delar spärren för registrerade repon, fysiska Git-kataloger, syskon-worktrees och befintliga GitHub-resursnycklar. Nya verifieringsbevis binds till försökets ID. Tidigare bevis, uppgiftsbeslut och agentstatus hålls åtskilda. Se [kontrakt och gränser](docs/controlos/verification-processes.md).

På Windows startas verifieraren genom den suspenderade native Job Object-värden. Identiteten sparas före resume och normalt avslut kräver ett tomt processträd. Osäkert spawn/stopp behåller karantänlåset. Omstart använder endast verifieringsförsökets eget autentiserade stoppkvitto; agentens kvitto kan inte låsa upp verifieraren. Återhämtning skapar varken nytt jobb eller godkänt bevis. Serveravslut väntar på verifieringsjobben. Körningsvyn visar separat status, stoppbegäran och kvittokontroll utan att exponera privata processidentiteter eller kvittonycklar.

`npm run verify` passerade med typkontroll, lint, 335 tester i 63 filer och byggning på Windows x64, Node 22.18.0/npm 11.7.0. Ett separat omprov av de sju ägarskapstesten passerade efter justerad städning av krasch-fixturen. Proven omfattar verkligt npm-kommando med underprocess, avslut av servern, separat kraschad verifierarprocess, återöppnad databas, atomisk claim, osäker spawn, fel kvitto, syskon-worktree, separata kloner och autentiserade stoppkontroller. En tidigare bred körning fick ett Git-fel vid upprepad repoimport; både separat omprov och den slutliga breda körningen passerade utan ändring av importkoden. Loggarna är ignorerade `controlos-verification-ownership-*.log`.

Fullt browserprov med uttryckliga DEMO-fixtures täcker verifieringsstopp, kvarhållet lås och bekräftat stopp utan falskt godkännande vid 1536/390 px. Agentkorten anpassas nu till en kolumn på mobilen så att namnen går att läsa. Webbens chunkvarning kvarstår, cirka 558 kB före gzip. Detta är lokala kontrollresultat, inte bevis på publicering, verklig modellkörning eller pilotnytta.

POSIX-adaptern redovisar fortfarande endast rotprocessens avslut. Andra hjälpprocesser, kraschen före sparad processidentitet, verifierad OS-sandbox och full native-profilmigrering återstår. Inget ytterligare fullständigt acceptansscenario markeras godkänt: 6 av 46 är lokalt godkända och R1–R4 är öppna. Följande avsnitt är historiska kontrollpunkter.

## R1: uttrycklig revidering och separat nytt försök

Avslutade uppgifter kan nu återöppnas med exakt uppgiftsversion, aktuellt försök, skäl och innehållsbunden återförsöksnyckel. Återöppning återkallar uppgiftsacceptans och väntande granskningar, sparar oföränderlig historik och återför uppgiften till utkast i samma transaktion. Lagringsfel lämnar inte en halv återöppning. Samma begäran ger samma åtgärds-ID även efter omstart eller senare redigering. Inget jobb startas av återöppningen. Se [kontrakt och gränser](docs/controlos/task-revisions.md).

Tidigare körningar, arbetskopior, verifieringsbevis och mänskliga körningsbeslut bevaras som historik. Kriteriehistoriken hämtar ursprunglig text från den oföränderliga uppgiftsdefinitionen, så ett gammalt omdöme inte byter betydelse när nästa version redigeras. Det gamla försöket kan inte godkänna den nya uppgiften eller starta ett nytt verifieringskommando efter återöppningen. Ett nytt jobb kräver en sparad redo-version och en separat granskad start; det får ett nytt körnings-ID och en ny arbetskopia.

Aktiva försök, karantänlås och pågående verifiering/resultatgranskning på värden spärrar återöppning. Verifierarens aktivitetsspärr är ännu inte beständig återhämtning för hjälpprocesser efter serverkrasch; det återstår inom R1. Tidigare ändringar kopieras inte automatiskt till ett nytt försöks bas.

Slutlig `npm run verify` passerade med typkontroll, lint, 327 tester i 62 filer och byggning på Windows x64, Node 22.18.0 och npm 11.7.0. API/Git/SQLite-proven täcker bland annat rollback, oförändrat tidigare resultat, nya kriterier med bevarad gammal text, separat andra försök, historisk verifiering som nekas, karantän, återöppnad profil och ett riktigt verifieringskommando som hålls igång med explicita testsignaler. Hela `npm run smoke` passerade vid 1536/390 px med DEMO-fixtures för återöppning, förlorat svar, identiskt återförsök, redigering, tangentbord och bevarad historik utan automatisk dispatch. Bilderna har granskats. Slutloggar: `controlos-task-reopening-final-verify.log` och `controlos-task-reopening-smoke.log` (ignorerade). Webbens chunkvarning kvarstår, cirka 557 kB före gzip.

T05/T06/T07/T20/T22/T43 har omprovats och källhasharna uppdaterats. Inget ytterligare fullständigt scenario markeras godkänt i denna etapp: 6 av 46 är lokalt godkända, 40 inte fullständigt provade, och R1–R4 är öppna. Ingen riktig modell, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

## R1: versionsbundna kriteriebeslut och ogiltigförklarad acceptans

Uppgifter kan nu godkännas genom en separat kriteriegranskning. Alla kriterier måste redovisas exakt en gång med bevisanteckning; obligatoriska kriterier kräver ett godkänt omdöme. Vyn visar det lagrade verifieringskommandot, utdata, bevis-ID, commit och innehållshash. Ett förberett `task.accept`-beslut binds till exakt uppgiftsversion, ursprunglig definition, kriteriebeslut, verifieringspost, resultat och policy. En andra bekräftelse förbrukar beslutet och sparar uppgiftsacceptans atomiskt. Detta är mänskliga kriterieomdömen, inte automatiskt härledda testresultat. Se [kontrakt och begränsningar](docs/controlos/task-criteria.md).

Omverifiering, korrigerat körningsutfall eller upptäckt ändrat/oläsbart innehåll ogiltigförklarar tidigare uppgiftsacceptans och återför uppgiften till granskning. Beslut och skäl bevaras i oföränderlig historik. Accepterade uppgifter har en uttrycklig innehållskontroll; någon kontinuerlig filövervakning påstås inte. Beroende uppgifter kontrollerar accepterade resultat före processstart. Migration 0013 bevarar äldre uppgiftsbindningar och testbevis utan att skapa påhittade kriteriegodkännanden. Även verifieringsposter är nu oföränderliga i SQLite.

Slutlig `npm run verify` passerade: typkontroll, lint, 325 tester i 62 filer och byggning på Windows x64, Node 22.18.0 och npm 11.7.0. API-proven använder riktiga temporära Git-repon, `npm run verify`-processer och återöppnade SQLite-profiler, med offlinefixturer för providern. De provar bland annat commit A→B, binärändring med inledande blanksteg i filnamnet, utbytt bevis-ID/anteckning/operation, transaktionell rollback, korrigering, omverifiering, migration och nekad start efter ändrat beroenderesultat. Hela `npm run smoke` passerade för 1536/390 px, bevisinspektion, separata gransknings-/bekräftelsesteg, tangentbord, inaktuella bevis och historik. Körningssvaren i webbprovet är uttryckliga DEMO-fixtures. Slutbilderna har granskats. Loggar: `controlos-task-review-final-verify.log` och `controlos-task-review-final-smoke.log` (ignorerade). Webbens chunkvarning kvarstår, cirka 553 kB före gzip.

T06 är lokalt godkänd; T05/T07/T20/T22/T43 har omprovats och källhasharna uppdaterats. Totalt är 6 av 46 scenarier lokalt godkända och 40 fortfarande inte fullständigt provade. Arbetsflöde för revidering/omkörning, projektspecifika verifieringskommandon, verifierad sandbox, riktiga provider-/pilotprov och full R1–R4 återstår. Ingen riktig modell, pilotagent, merge eller deploy kördes. Följande avsnitt är historiska kontrollpunkter.

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
