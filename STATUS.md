# ControlOS — verifierat nuläge 2026-09-27

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
- CI-definitionen kör verifiering på Windows/Ubuntu och Node 22.12/24. Aktuella fjärrkörningar och obligatoriska merge-regler är inte bevisade av lokala tester.

## Kontrollresultat

Miljö: Windows, Node 22.18.0, npm 11.7.0.

| Kontroll | Resultat och begränsning |
|---|---|
| `npm run verify` | Godkänd: typkontroll, lint, 249 tester och byggning. Inkluderar policyregression, felaktiga dispatchfält samt innehållskontroll av binära filer och filnamn med inledande blanksteg. |
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
