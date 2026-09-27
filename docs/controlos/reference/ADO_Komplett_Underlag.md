# ADO / ControlOS: komplett förarbete

Granskat 2026-09-26. Ingen implementation utförd.

# ADO / ControlOS: granskat förarbete
## Beslutsunderlag · 26 september 2026

**Rekommendation: fortsätt i Wrexist/ADO. Bygg inte ännu en parallell plattform.** Behåll det som fungerar, åtgärda exekverings- och dataintegritetsriskerna, och gör projektens nästa steg samt mobilflödet till produktens centrum.

Detta är ett förarbete och en föreslagen ny baslinje, inte en färdig implementation eller en säkerhetscertifiering. Ingen projektkod, GitHub-branch, inställning, anslutning eller driftsmiljö har ändrats. Ingen ny betalande tjänst har aktiverats.

## Vad som faktiskt har gjorts

Repoets centrala instruktioner, mål, fasmanifest, masterplan, delar av arbetsloggen, hela runner-/spawnerkedjan, säkerhetslagret, anslutningslagret och databasschemat har granskats. Serverns första 245 rader har också lästs. GitHub rapporterar historisk CI-framgång för den granskade committen den 19 juli 2026. Aktuella primärkällor för relevanta teknikval har kontrollerats. [SRC01–SRC22](10_KALLOR_OCH_EVIDENS.md)

Granskad snapshot: `Wrexist/ADO@bb19caba68c1cda13249c8d722a9b6647133dc8f`.

## Viktigaste korrigeringarna

| Tidigare riktning | Föreslagen riktning |
|---|---|
| Nytt stort AI-operativsystem från noll | Återbruka befintlig ADO-implementation och ompröva bara svaga delar |
| 1 000 repos och 100 samtidiga agenter | 50 repos i skaltest, tre pilotprojekt, en skrivare per repo |
| Desktop med mobil senare | Responsiva kärnflöden i v1, privat fjärråtkomst efter säkerhetsgrind |
| Agenten säger klar | Oberoende kontroller kopplade till exakt resultat och commit |
| Worktree som säkerhetslösning | Worktree för Git-isolering, separat verifierad exekveringsgräns |
| Många providers från början | Härda en fungerande adapter, verifiera Codex som nästa möjlighet |
| Aktivitet och appöppningar som nytta | Kortare startsträcka, mindre handpåläggning och fler godkända resultat |

## Läsordning

1. [Masterplan](01_MASTERPLAN.md) och [nulägesaudit](02_AUDIT_NULAGE.md).
2. [Arkitekturbeslut](03_ARKITEKTUR_OCH_BESLUT.md), [domän och migrering](04_DOMAN_API_OCH_MIGRERING.md), [säkerhet och återställning](05_SAKERHET_DRIFT_OCH_ATERSTALLNING.md).
3. [UX, planering och kontext](06_UX_PLANERING_OCH_KONTEXT.md), [byggordning](07_BYGGORDNING_OCH_GRINDAR.md) och [acceptanstester](08_ACCEPTANSTESTER.md).
4. [Bygghandoff](09_BYGGHANDOFF.md) när implementation uttryckligen får börja.

Maskinläsbara register finns i `machine/`. Planerade kontrakt och exempel finns i `contracts/` och `examples/`. `validate_pack.py` kontrollerar paketets interna länkar, ID:n, beroenden och JSON-kontrakt. Det kör inte ADO och bevisar inte att appen klarar acceptanstesterna.

## Kvarvarande verkliga kontroller

Det gick inte att ladda ned och köra hela repot i arbetsmiljön. Därför har ingen ny `npm run verify`, Windowsinstallation, riktig agentkörning, processträdsavstängning, restore drill eller mobilanslutning verifierats här. Dessa har konkreta testfall och beslutspunkter i paketet. Historiska testantal i repoets logg behandlas som historik, inte som ny körning.

**Alla 46 applikationsacceptanstester är markerade `not_run`.** R0 kan påbörjas med detta underlag. Autonom skrivning, privat fjärrkörning och beteckningen färdig v1 får inte öppnas på enbart dokumentation.

## Första säkra nästa steg

Återskapa den befintliga ADO-installationen i en separat kontrollerad arbetskopia, bevara användardata och kör R0. Börja inte med fler dashboards, nya modellnamn eller en ombyggnad av hela stacken.


---

# Masterplan: ett användbart projektkontrollcenter

## 1. Produktlöftet

**ADO ska göra det enkelt att återuppta rätt projekt, välja nästa viktiga uppgift och föra arbetet till ett verifierbart resultat från dator eller mobil.**

Kärnflödet är:

```text
Överblick → välj projekt eller nästa uppgift → hämta rätt kontext
→ planera eller lämna ett avgränsat uppdrag → följ arbetet
→ granska bevis och ändringar → godkänn → uppdatera nästa steg
```

Det är inte ett löfte om självgående företag, obegränsad intelligens eller ett system som aldrig behöver byggas om. Kvaliteten ska märkas i mindre glömska, färre felaktiga starter och mindre manuell samordning.

### Målperson och användningssituation

Förslaget utgår från en ensam utvecklare med flera appar, spel och webbprojekt samt begränsad sammanhängande arbetstid. Datorn används för tyngre granskning och lokala verktyg. Telefonen används för idéinsamling, beslut, uppdrag och uppföljning. Projekt kan ha olika teknik, byggmiljöer och releaseprocesser.

Detta är designantaganden för den nya versionen. Faktisk maskinkapacitet, installerade provider-versioner, aktiva abonnemang och lokala paths ska inventeras i R0. Repoets verkliga grund är redan Vite/React, Fastify, SQLite/Drizzle, Zod, SSE och en Windowswrapper. [SRC01, SRC03](10_KALLOR_OCH_EVIDENS.md)

## 2. Vad användaren ska kunna göra

### A. Få tillbaka sammanhanget

Projektkortet visar projektets mål, senast verifierade läge, aktuellt fokus, nästa handling, blockerare och var informationen kommer från. Det ska gå att förstå vad som behövs utan att först läsa en lång AI-chat.

Senaste commit, senaste releasetagg, senaste lyckade bygge och faktiskt distribuerad version är olika fält. Ett gammalt grönt bygge får inte ge ny kod en grön status. Egna prioriteringar och externa observationer hålls isär.

### B. Samla idéer utan administration

En inkorg accepterar text direkt. Projekt, repo, deadline och tidsuppskattning är frivilliga när idén fångas. En idé blir inte automatiskt en körbar agentuppgift. För att bli körbar behöver den rätt mål, avgränsning, acceptance och policy.

### C. Se alla projekt och deras samband

En lista är huvudrepresentationen. Universe är en valfri karta över projekt, idéer och explicita relationer. Den ska inte förväxlas med en automatiskt korrekt karta över hela kodbasens arkitektur. En enkel relationstabell räcker för v1. Beroendeanalys på kodnivå skjuts upp tills ett konkret beslut kräver den.

### D. Planera utifrån tiden som faktiskt finns

Användaren kan ange ett tillgängligt tidsfönster och låsa ett fokus. Systemet filtrerar bort blockerade eller otillåtna uppgifter och ger ett litet förslag med motivering. Ingen kalender kopplas eller ändras automatiskt i v1. En AI får föreslå ordning och nedbrytning, men får inte hitta på deadlines eller ändra mål utan beslut.

### E. Lämna avgränsade uppdrag

En körbar uppgift innehåller resultat, avgränsning, acceptanstester, repo och basrevision. Kontrollcentret visar vad agenten får göra, vilka resurser som behövs och vad som kommer kräva ytterligare godkännande. Ett generellt “gör allt perfekt” ska brytas ned innan exekvering.

### F. Få ett kontrollerbart avslut

Slutrapporten visar ändrade filer, diff/commit, tester med utfall, manuella kontroller, kvarstående blockerare och föreslaget nästa steg. Agentens egen text är ett förslag till rapport, inte ett slutbevis. En uppgift kan vara tekniskt färdig för granskning men ändå inte accepterad.

## 3. Innehåll i den personliga v1-versionen

| Område | Ingår | Avsiktlig gräns |
|---|---|---|
| Projekt | Register, nästa handling, status, källor och länkar | Ingen automatisk sammanblandning av lika namn |
| Uppgifter | Inbox, enkel tavla/lista, beroenden, acceptans | Ingen full Jira-klon |
| Roadmap | Milstolpar och exitkriterier | Inga säkra långtidsprognoser |
| Universe | Projekt- och idékarta med listalternativ | Ingen full kodkunskapsgraf |
| Kontext | Godkända instruktioner, källor och versionsbundet handoff | Ingen okontrollerad indexering av alla filer |
| Agentarbete | En härdad adapter, säker kö, logg, avbrott och review | Inget autonomt merge eller produktionsdeploy |
| Mobil | Läsa, fånga, planera, starta godkänd körning och granska | Ingen full kodeditor på telefonen |
| Drift | Backup, restore, migrering, begränsade resurser och ärliga offline-lägen | Ingen molnplattform eller multi-tenant-drift |

Codex är nästa adapter att prova efter den befintliga härdningen. Det officiella app-server-gränssnittet ger en dokumenterad integrationsväg. Exakt versions- och capabilitiesstöd fastställs i R3, inte genom att anta att varje provider kan samma saker. [SRC15](10_KALLOR_OCH_EVIDENS.md)

## 4. Sådant som inte ingår nu

Automatisk model-routing baserad på små datamängder, självlärande ändringar i säkerhetspolicy, en pluginmarknadsplats, mikrotjänster, Kafka, Redis, en separat grafdatabas, en vektordatabas, tiotals integrationer, automatisk tillgång till kundproduktion och en egen universell terminal/IDE skjuts upp.

Det innebär inte att visionen förkastas. En framtida funktion ska läggas till när ett konkret behov inte kan lösas enklare och när dess driftkostnad ryms i den tid användaren faktiskt har.

## 5. Återbruk före omskrivning

Den befintliga implementationen har en rimlig liten grund. Den nya riktningen ska återanvända fungerande scanner, GitHub-läsning, UI-komponenter, Zod-mönster, SQLite och desktopskal. [SRC01](10_KALLOR_OCH_EVIDENS.md)

Det som ska ändras först är gränserna mellan en uppgift, en agentkörning, ett bygge och ett verifierat resultat. Därefter kö, exekveringspolicy, processhantering och anslutningslagring. Först sedan görs fler användarflöden tillgängliga.

T3 Code är ett relevant jämförelsealternativ och en möjlig extern agentarbetsyta. Vi har inte verifierat ett stabilt API som gör T3 till säker infrastruktur under ADO. Därför föreslås varken en obligatorisk T3-fork eller läsning av T3:s interna databas. [SRC17](10_KALLOR_OCH_EVIDENS.md)

### Beslutsregel för en egen arbetsyta

Jämför samma tre användningsfall: återuppta ett vilande projekt, lämna ett avgränsat uppdrag och följa upp från mobilen. Om ett befintligt verktyg plus enkel projektlista löser dem lika bra med mindre underhåll, begränsas ADO till den del som ger verkligt mervärde. Att det redan finns kod är inte i sig ett skäl att fortsätta varje funktion.

## 6. Mål som går att testa

Följande är **föreslagna mål, inte uppmätta resultat**:

| Mål | Föreslagen acceptans |
|---|---|
| Återuppta projekt | Rätt mål, källa och nästa handling går att hitta på under en minut i piloten |
| Fånga idé | Kan göras med ett enda obligatoriskt textfält |
| Veta vad som kräver beslut | Today visar högst tre prioriterade handlingar före övrig aktivitet |
| Skydda arbete | Ingen förlorad accepterad uppgift eller ändrat originalcheckout i feltesterna |
| Säkra avslut | Ingen task blir verifierat klar på endast exitkod eller agentpåstående |
| Begränsa arbete | En skrivare per repo, två aktiva körningar totalt som försiktig startkonfiguration |
| Hantera datamängd | 50 repos i metadata-/renderingstest utan att läsa all kod eller starta agenter |
| Mobil | Kärnflöden vid 390 px utan obligatorisk horisontell scroll |
| Drift | Påvisad restore till separat datakatalog innan daglig skarp användning |
| Nytta | Tio verkliga uppgifter, tre projekt och minst fem arbetstillfällen med dokumenterad handpåläggning |

Kapacitet och latens mäts på avsedd maskin. Innan det finns mätdata lovas ingen viss global svarstid eller besparing i kronor.

## 7. Avslutsregel

Personlig v1 är klar när samtliga obligatoriska krav och tester för aktiverade funktioner har evidens och användarpiloten visar lägre nettofriktion. Ett underkänt säkerhetstest kan inte kompenseras med snyggare UI eller fler gröna enhetstester. En oanvänd extraprovider förblir avstängd, inte halvfärdigt annonserad.

När dessa krav är uppfyllda stoppas utökningen. Nästa investering ska baseras på observerade hinder i verkligt arbete, inte på att roadmapen kan göras längre.


---

# Nulägesaudit och riskklassning



Granskningen gäller `Wrexist/ADO@bb19caba68c1cda13249c8d722a9b6647133dc8f`. Den är en statisk granskning av angivna filer, inte en full penetrationstestning eller ny runtimeverifiering. Prioriteten nedan avser fortsatt arbete i detta projekt, inte ett CVSS-betyg eller bevisad exploaterbarhet.



## Det som är en bra grund



ADO har redan verkliga komponenter för lokal dashboard, källdata, användningslogg och Windowsdistribution. Säkerhetslagret har Host-allowlist och tokenkontroll på mutationer. SSE är också autentiserat och serverns URL-loggning redigerar token. Det är därför fel att beskriva nuläget som en helt öppen eller helt obefintlig lösning. [SRC01, SRC09, SRC10](10_KALLOR_OCH_EVIDENS.md)



## Fynd



### A01 · Befintligt projekt måste vara utgångspunkt

**Prioritet:** high. **Underlag:** decision. **Runtime-reproducerat:** nej.



**Observerat:** ADO har redan server, webb, desktop, scanner, runner och dokumentation.

**Betydelse:** Att skapa ett parallellt ControlOS riskerar dubbel administration och kastat arbete.

**Föreslagen åtgärd:** Återbasera ADO före ny featureutveckling.

[SRC01, SRC03](10_KALLOR_OCH_EVIDENS.md)



### A02 · Fasbeskrivning och verkliga grindar går isär

**Prioritet:** medium. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** Fas 6 anges samtidigt som p2.5, p3 och p3.5 är öppna. Masterplanen innehåller äldre och senare ändrade kriterier.

**Betydelse:** Fasnummer eller checklistor kan misstas för bevisad användbarhet.

**Föreslagen åtgärd:** Spara historik, inför versionsbundet evidensregister och ersätt motsägelser med en aktiv specifikation.

[SRC04, SRC05, SRC06](10_KALLOR_OCH_EVIDENS.md)



### A03 · Mobil är bortvald i den äldre v1-planen

**Prioritet:** high. **Underlag:** product. **Runtime-reproducerat:** nej.



**Observerat:** GOALS utesluter mobil och kräver stor desktopvy.

**Betydelse:** Målet att driva projekt från telefonen uppfylls inte av ursprungligt scope.

**Föreslagen åtgärd:** Mobilens kärnflöden ingår i nya v1, men fjärrkörning öppnas först efter säkerhetsgrind.

[SRC02](10_KALLOR_OCH_EVIDENS.md)



### A04 · Flera skrivare saknar arbetskopieisolering i runnerkedjan

**Prioritet:** high. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** Runnerns globala gräns är tre. Cwd skickas direkt till spawnern. Ingen per-repo-exklusivitet eller worktree skapas i denna kedja.

**Betydelse:** Samtidigt godkända skrivande agentjobb kan använda samma arbetskopia.

**Föreslagen åtgärd:** Inför repoägarskap, en skrivare och separat arbetskopia. Testa OS-sandbox separat.

[SRC07, SRC08](10_KALLOR_OCH_EVIDENS.md)



### A05 · Kön och körningstidslinjen ligger i minnet

**Prioritet:** high. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** Runnern använder en array för kön. queued och running blir failed vid omstart. Timelines för äldre boots saknas.

**Betydelse:** Accepterat arbete kan inte återupptas som kö och diagnostik försvinner.

**Föreslagen åtgärd:** Beständig jobbmodell, attempts, leases, händelser och försiktig processavstämning.

[SRC07](10_KALLOR_OCH_EVIDENS.md)



### A06 · Dispatchspärr kontrolleras inte på nytt vid start

**Prioritet:** high. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** blockedReason kontrolleras i dispatch. drainNext kontrollerar endast cwdFor före run och spawn.

**Betydelse:** Ett redan köat jobb kan börja efter att användaren stängt av dispatch för projektet.

**Föreslagen åtgärd:** Ompröva policy vid claim och omedelbart före exekvering, med regressionstest T19.

[SRC07](10_KALLOR_OCH_EVIDENS.md)



### A07 · Exitkod används som uppgiftens slutbevis

**Prioritet:** high. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** exitCode===0 styr done och Task completed. verifyVerdict är reserverat och skrivs inte i den granskade vägen.

**Betydelse:** En agent som inte uppfyllt kraven kan ändå visas som klar.

**Föreslagen åtgärd:** Separera process, uppgift, acceptansbevis och godkännande. Mappa äldre done till verifiering okänd.

[SRC07, SRC12](10_KALLOR_OCH_EVIDENS.md)



### A08 · Turnbudget visas som procentförlopp

**Prioritet:** medium. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** pct beräknas från turns/turnCap. Agentkörningen exponeras också som build med branchsträngen agent.

**Betydelse:** Budgetförbrukning kan uppfattas som färdigställande och syntetisk branch som faktisk Gitgren.

**Föreslagen åtgärd:** Visa turnförbrukning och faktisk branch när den finns. Skilj agentkörning från byggresultat.

[SRC07](10_KALLOR_OCH_EVIDENS.md)



### A09 · Felutdata kastas bort och stopp gäller endast child-handle

**Prioritet:** high. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** stderr sätts till ignore. kill anropar child.kill(SIGTERM). Ingen processträdseskalering finns i denna klass.

**Betydelse:** Autentiseringsfel blir svåra att förstå. Underprocesser kan kräva separat stopp. Exakt Windowsbeteende är inte provat.

**Föreslagen åtgärd:** Begränsad redigerad stderr-konsumtion, trädtillhörighet, grace, eskalering och stoppbevis.

[SRC08](10_KALLOR_OCH_EVIDENS.md)



### A10 · Anslutningslagret kan tyst återställas och saknar atomisk skrivning

**Prioritet:** high. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** load fångar alla fel och väljer tomt objekt. persist skriver JSON direkt och chmod är best effort. Värden lagras som klartext.

**Betydelse:** Korrupt/oläsbar fil kan senare skrivas över. Filmode är inte en generell Windows-vault.

**Föreslagen åtgärd:** Skilj ENOENT från fel, atomisk återställbar lagring, plattformsvault där tillgänglig och explicit migration.

[SRC11](10_KALLOR_OCH_EVIDENS.md)



### A11 · Långlivad SSE-token i URL behöver ersättas före fjärråtkomst

**Prioritet:** medium. **Underlag:** hardening. **Runtime-reproducerat:** nej.



**Observerat:** SSE är autentiserat och Hostallowlist finns. URL-token stöds och redigeras i serverloggen.

**Betydelse:** Andra framtida logg-/proxy-/exportytor kan exponera URL-token. Ingen faktisk läcka har påvisats.

**Föreslagen åtgärd:** Inför lämplig sessionsauth, auktorisera känsliga läsningar och testa proxy/Host/Origin. Behåll befintligt loopbackskydd.

[SRC09, SRC10](10_KALLOR_OCH_EVIDENS.md)



### A12 · Node-baslinjen är för gammal för fortsatt drift

**Prioritet:** high. **Underlag:** compatibility. **Runtime-reproducerat:** nej.



**Observerat:** Projektinstruktionen anger Node 20.12+. Node 20 listas EOL i officiell releaseöversikt.

**Betydelse:** En gammal stödbaslinje kan behålla onödiga säkerhets- och kompatibilitetsrisker.

**Föreslagen åtgärd:** Prova och lås en stödd LTS, föreslaget Node 24. Testa Electron-runtime och native-moduler separat.

[SRC03, SRC14](10_KALLOR_OCH_EVIDENS.md)



### A13 · Connected betyder bara att ett värde finns

**Prioritet:** medium. **Underlag:** static. **Runtime-reproducerat:** nej.



**Observerat:** statusOf sätter connected=Boolean(value).

**Betydelse:** Utgångna eller felaktiga credentials kan presenteras som fungerande anslutning.

**Föreslagen åtgärd:** Separera configured, authenticated, reachable och authorized samt senaste verifiering.

[SRC11](10_KALLOR_OCH_EVIDENS.md)



## Skillnaden mellan fynd och risk



A04 visar att det saknas isolering i den granskade kedjan. Det bevisar inte att användaren redan har förlorat ändringar. A09 visar direkt SIGTERM och ignorerad stderr, inte ett redan reproducerat Windowsstoppfel. A11 är en begränsning inför utökad åtkomst, inte en konstaterad tokenläcka. A12 styr ett kompatibilitetstest, inte en blind major-uppgradering.



## Historisk verifiering



GitHub API rapporterade att CI-run 29690231132 för den granskade committen avslutades framgångsrikt den 19 juli 2026. Repoets historik uppger dessutom 215 tester. Den här granskningen har inte kört om dem och har inte hämtat en ny komplett logg som självständigt styrker testantalet. [SRC04, SRC13](10_KALLOR_OCH_EVIDENS.md)



## Vad som inte har kontrollerats



Hela kodbasen, andra brancher, lokala ändringar på användarens PC, faktisk installerad exe-version, installationssigneringens nuläge, alla API-rutter, provider-inloggningar, verklig sandbox, processträd på Windows, telefonens anslutning, GitHub App-behörigheter och återställning på en tom datakatalog är inte verifierade. Det ska inte läsas som en rapport om att dessa saker fungerar eller är trasiga.



## Omedelbar praktisk slutsats



Bevara originalcheckout och användardata. Öka inte parallell skrivning eller exponera servern utanför loopback innan R1 respektive R3 är uppfyllda. Utöka inte anslutningslagret med fler känsliga nycklar innan lagringen och felhanteringen är verifierade.


---

# Arkitektur och beslut

## Målbild

```text
Windowsapp (befintlig Electron)     Mobil/webb via privat HTTPS
                 │                         │
                 └──── samma appgränssnitt ─┘
                                │
                  autentiserad lokal API-tjänst
           projekt · uppgifter · planering · godkännanden
                                │
                  SQLite + befintlig händelsebuss
             domäntabeller · kö · attempts · outbox · logg
                                │
                      kontrollerad runnergräns
             policy · repo-/resurslås · budget · arbetskopia
                                │
                 versionsbundna provideradaptrar
                  stöd som faktiskt verifierats
                                │
                   testbevis → review → handoff
```

Detta är en modulär applikation, inte ett nät av mikrotjänster. Runnern behöver en process- och behörighetsgräns, men det innebär inte att varje funktionsmodul ska bli en separat driftstjänst.

## ADR01: befintlig kod före greenfield

**Beslut:** behåll Wrexist/ADO som teknisk bas. UI, server, datalager och desktop finns redan. [SRC01](10_KALLOR_OCH_EVIDENS.md)

**Avvisat nu:** ny Next.js/Supabase-app enbart för att den stacken föreslogs i en äldre konversation. Det löser inte Windowsprocesser, lokal agentkontroll eller säker migrering.

**Omprövas när:** baslinjen inte kan återställas eller välavgränsade kärnmoduler är bevisat dyrare att reparera än ersätta. Ett sådant beslut ska göras per modul, inte som reflex att skriva om allt.

## ADR02: en liten modulär server

**Beslut:** behåll Fastify och TypeScript. Dela ansvar i tydliga interna moduler och kontrakt. Flytta bara långlivad agentexekvering bakom en kontrollerad runnergräns.

**Tradeoff:** en server ger gemensamt felområde, men enklare drift och färre nätverksfel. Runnerfel ska inte ta ned API:t eller korrupta kön.

**Omprövas när:** mätningar visar att en separat tjänst behövs för en oberoende maskin eller säkerhetsgräns. Ingen Redis eller extern event broker på spekulation.

## ADR03: behåll SQLite, undvik två sanningar

**Beslut:** befintlig eventlagring och bus-replay behålls för nuvarande telemetry. Nya arbetsflöden får explicita domäntabeller, beständig kö och transaktionell outbox. Deriverade UI-events publiceras först efter commit.

**Avvisat:** att bygga om allt till full event sourcing eller att skriva både domänstate och UI-state med oberoende lyckanden. Dataägarskap per entitet definieras i domändokumentet.

**Omprövas när:** flera aktiva serverskrivare på olika maskiner verkligen krävs. Local-first är inte ett löfte om sömlös distribuerad synk utan framtida migrering.

## ADR04: separera uppgift från körning

**Beslut:** Task beskriver avsett resultat. RunAttempt beskriver en processkörning. VerificationEvidence beskriver testbevis. Approval beskriver ett mänskligt beslut. Build är ett faktiskt byggjobb.

En lyckad agentprocess ger högst ready_for_review. En task blir accepted först när dess kriterier har stöd. Existerande done-rader migreras inte till bevisad funktion. [SRC07, SRC12](10_KALLOR_OCH_EVIDENS.md)

## ADR05: worktree för Git, sandbox för exekvering

**Beslut:** varje skrivande körning får en separat arbetskopia och branch från verifierad bas. Tillåt högst en skrivare per repo initialt, även om olika branches tekniskt kan användas samtidigt. Worktrees är inte en säkerhetsgräns. [SRC18](10_KALLOR_OCH_EVIDENS.md)

Git worktrees delar också Git-metadata. Därför används en isolerad klon/snapshot för obevakad skrivning om agentens åtkomst till gemensamma refs, hooks och config inte kan begränsas säkert. Gitoperationer med högre behörighet utförs av en validerad broker, inte av ett obegränsat agentshell. Återbruk av objektcache får vara läsande och får inte ge skrivåtkomst till originalrepot.

Autonom exekvering kräver en beprövad provider-/OS-sandbox som klarar canarytest för filer, hemligheter och otillåten nätåtkomst. Vi bygger inte en egen generell sandboxmotor. Miljön väljs i ett konkret kompatibilitetstest.

**Fallback:** läs-/planeringsläge och manuell handoff. Ett uttryckligen valt övervakat lokalt läge ska märkas som icke-isolerat och får inte låtsas uppfylla kraven för obevakad fjärrkörning.

## ADR06: liten, beständig schemaläggare

**Beslut:** jobs och attempts lagras före kvittens. Claims görs transaktionellt med leaseägare, generation/fencing och sista heartbeat. Ett ensamt process-ID räcker inte som identitet. Externa operationer avstäms separat.

**Garantin:** högst ett giltigt ägarskap för en task/arbetskopia i taget enligt databasen. Vi lovar inte exakt en extern sidoeffekt genom nätverk och processkrascher. Dubbletter förhindras med idempotens och avstämning där motpartens API tillåter det.

## ADR07: providers via verifierade capabilities

**Beslut:** behåll den befintliga adaptern men härda dess processlager. Codex provas via dokumenterat app-server-protokoll över stdio. Versionsmatchade scheman och adapterkontrakt används. [SRC08, SRC15](10_KALLOR_OCH_EVIDENS.md)

Gemensam kärna: probe, start, eventström, cancel, outcome och usage när det stöds. Resume och interaktiva approvals är tilläggsförmågor. Ingen provider får ett påhittat pause/resume-stöd eller samma sessionsformat som en annan.

**Omprövas när:** en ytterligare provider ger påvisad nytta i representativa uppgifter och kan bära sin integrations- och underhållskostnad.

## ADR08: T3 Code som alternativ eller handoff

**Beslut:** jämför T3 Code som extern arbetsyta. Ingen fork och inget beroende av odokumenterade internals. [SRC17](10_KALLOR_OCH_EVIDENS.md)

T3 och ADO får inte samtidigt vara exekveringsägare i samma checkout. Välj antingen ADO-managed run eller ett tydligt överlämnat externt arbete. Synk av sammanfattning ska vara explicit, inte påstås vara full livekontroll.

## ADR09: privat mobilåtkomst, ingen publik endpoint

**Beslut:** återanvänd samma responsiva webbgränssnitt och server. Ett möjligt transportval är Tailscale Serve inom en privat tailnet. Funnel, publik tunnel och port-forward av runner-API är inte del av v1. [SRC19](10_KALLOR_OCH_EVIDENS.md)

Applikationssession, enhetsparning, revokering, host-/originpolicy och auth för känsliga läsningar ska finnas även innanför det privata nätet. Transportskydd ersätter inte appbehörighet. Reverse-proxy-inställningar måste provas med faktisk Host/Origin och bara betrodda proxyheaders.

**Begränsning:** datorn måste vara igång och servern köras för att den ska utföra arbete. En framtida alltid-på-värd är ett separat beslut med drift- och kostnadsansvar.

## ADR10: hållbar versionsbas

**Beslut:** byt inte ramverk i onödan. Prova Node 24 LTS för server/CI och dokumentera separat vilken Node-runtime Electronpaketet använder. Node 20 listas som EOL vid granskningen. [SRC14](10_KALLOR_OCH_EVIDENS.md)

Lås exakt testade patchversioner och lockfile efter kompatibilitetsprovet. Native-moduler, installationspaket och migrationer behöver egna kontroller. “Senaste” är inte en reproducerbar version.

## ADR11: fakta före AI-planering och självförbättring

**Beslut:** metadata, beroenden, manuella beslut och faktisk historik driver planeringen. AI får föreslå, sammanfatta och identifiera luckor. Inga automatiska förändringar av säkerhetspolicy eller produktionskod från ett lärsystem.

När det finns tillräckliga riktiga uppgifter kan förslag utvärderas mot en jämförbar baseline. Ett godtyckligt antal körningar är inte ensamt bevis för statistisk styrka eller bättre modellrouting.

## ADR12: OS-hemlighetslager och tydliga gränser

**Beslut:** providerhemligheter ska inte vara portfolio-dokument, frontendvariabler eller generell arbetskatalogdata. Använd plattformsstödd skyddad lagring där den är tillgänglig, med tydligt fel om säkert läge saknas. [SRC20, SRC21](10_KALLOR_OCH_EVIDENS.md)

Detta eliminerar inte alla hot från malware eller processer med samma användarbehörighet. Säker exekvering kräver separat kontroll av vilka filer och resurser agentens verktyg kan läsa. Det är inte tillräckligt att ta bort en miljövariabel men ge processen tillgång till hela HOME.

## ADR13: UI-bibliotek återbrukas

**Beslut:** fortsätt med befintliga tokens, komponenter och tillgänglighetsmönster. Lägg till en tydlig Today-yta och responsiva projekt-/run-flöden. De två äldre dashboardvyerna får leva kvar som sekundära vyer tills jämförelse visar vad som ska tas bort.

En grafbiblioteksutvärdering görs bara för den avgränsade Universe-vyn. Tvinga inte in en tung grafmotor i startsidan.

## ADR14: säkert stopp för expansion

**Beslut:** ingen funktion öppnas bara för att implementeringen kompilerar. Bevis för användarbehov, korrekta data, säkerhet, återställning och faktiskt stöd krävs. Automation som inte sparar handpåläggning tas bort eller förenklas.

En blockering i ett nödvändigt säkerhetssteg stoppar beroende funktioner. Den hindrar inte oberoende läs-/planeringsarbete, men det arbetet får inte beskrivas som om säkerhetsgrinden passerat.


---

# Domänmodell, API och migrering

Detta beskriver föreslagna kontrakt. Det är inte färdig migrationskod och ska jämföras med hela aktuella schema-/routeimplementationen innan någon förändring görs.

## 1. Vem äger informationen?

| Information | Auktoritativ källa | ADO:s roll |
|---|---|---|
| Produktmål, fokus, lokal roadmap | ADO:s domäntabeller | Primär källa med historik och export |
| Uppgifter som skapas i ADO | ADO Task | Primär källa, kan länka en GitHub Issue |
| GitHub Issues | GitHub | Läsbar länk/import med källa, ingen osynlig tvåvägssynk i v1 |
| Commit, branch, PR, CI | Git/GitHub vid angiven revision | Cache och projektion med tidsstämpel |
| RunAttempt, lease, godkännande | ADO:s exekveringsdomän | Primär källa |
| Faktiskt pågående process | Verifierad runner-/OS-observation | DB-status måste avstämmas mot observation |
| Fakturerad kostnad | Providerunderlag | Återge bara när det finns underlag |
| AI-sammanfattning | AI-genererat förslag med källor | Aldrig automatiskt auktoritativ fakta |

Den befintliga modellen har events, samples, schedulerjobs och runs. Nya tabeller ska läggas till kontrollerat, inte ersätta hela den historiken. [SRC12](10_KALLOR_OCH_EVIDENS.md)

## 2. Minsta hållbara entiteter

### Project

`id`, `name`, `kind`, `goal`, `lifecycle`, `focus`, `nextTaskId`, `manualPriority`, `createdAt`, `updatedAt`, `version`.

Ett Project är en produkt eller ett arbete, inte bara en sökväg. Det kan sakna repo och ha flera repos. `lifecycle` är till exempel active, paused, maintenance eller archived. Paused projekt kan fortfarande ha säkerhetskritiska observationer som behöver visas.

### Repository och Checkout

Repository: `id`, `projectId`, `host`, `externalRepositoryId`, `canonicalRemote`, `defaultBranch`, `lastObservedAt`.

Checkout: `id`, `repositoryId`, `hostId`, `canonicalPath`, `realPathIdentity`, `isManaged`, `lastObservedHead`.

Autodetektering föreslår koppling. Användaren bekräftar oklara namn. Windows skiftläge, junctions, symlinks och nätverksdiskar måste hanteras vid pathvalidering. En path kan inte godkännas med en enkel strängprefixjämförelse.

### Task och Milestone

Task: `id`, `projectId`, `repositoryId?`, `title`, `outcome`, `scope`, `outOfScope`, `acceptance[]`, `dependsOn[]`, `milestoneId?`, `priority`, `status`, `sourceRefs[]`, `version`.

Milestone: `id`, `projectId`, `title`, `exitCriteria[]`, `status`. Datum är valfria. En riktig deadline sparas med källa och vem som bestämt den. En prognos har separat fält och osäkerhet.

### ExecutionJob och RunAttempt

Job: stabilt `id`, `taskId`, `requestedBy`, `idempotencyKey`, `requestHash`, `eligibleAfter`, `createdAt`, `status`.

Attempt: `id`, `jobId`, `attemptNumber`, `parentAttemptId?`, `providerId`, `providerVersion`, `modelId`, `hostId`, `workspaceId`, `baseSha`, `policyVersion`, `leaseOwner`, `leaseGeneration`, `leaseExpiresAt`, `processIdentity?`, `status`, `outcome`, `startedAt`, `endedAt`.

Workspace har dessutom ett explicit kind: worktree, isolated_clone eller snapshot. Valet styrs av den verifierade säkerhetsprofilen, inte av vad som råkar vara snabbast.

ProcessIdentity ska innehålla runner-/bootidentitet och processens skapelseidentitet utöver PID. Återförsök skapar ett nytt försök med lineage. Tidigare misslyckanden skrivs inte över.

### VerificationEvidence och Approval

Evidence: `id`, `taskId`, `attemptId`, `criterionId`, `type`, `status`, `targetSha`, `workspaceDigest?`, `toolVersion`, `commandRef?`, `artifactRef?`, `recordedAt`, `source`.

Approval: `id`, `actorId`, `operation`, `repositoryId`, `targetSha`, `diffHash?`, `payloadHash`, `policyVersion`, `issuedAt`, `expiresAt`, `consumedAt?`.

Ett godkännande får inte återanvändas för andra operationer. Ett testbevis som saknar revision får inte automatiskt auktorisera ny kod.

### Artifact, ContextPacket och SourceObservation

Artifact anger filtyp, storlek, digest, ägare, retention och säker visningsmetod. En HTML-logg från en agent ska inte köras som betrodd HTML i dashboarden.

ContextPacket innehåller `projectId`, `repositoryId`, `baseSha`, instruktionernas hashar, inkluderade källor, begränsningar och token-/storleksbudget. Det refererar data i stället för att duplicera hela historiken.

SourceObservation lagrar källa, extern identitet, observedAt, subjectSha och confidence/type. Färskhet bestäms per källa. Frånkopplad GitHub kan samexistera med fungerande lokalt projektarbete.

## 3. Tillstånd och övergångar

### Task

```text
draft → ready → queued → active → awaiting_review → accepted
          │        │        │            │
          └────────┴────────┴────────── blocked
```

Alla states kan arkiveras genom explicit användarhandling när ingen aktiv mutation pågår. `accepted` kräver obligatoriska kriterier godkända för aktuellt resultat. Omgjort arbete öppnar en ny revision av uppgiften, inte en retroaktiv förfalskning av gamla bevis.

### RunAttempt

```text
queued → preparing → running ↔ waiting_approval
                         │
                         ├─ succeeded
                         ├─ failed
                         ├─ cancelled, först när stopp bekräftats
                         ├─ interrupted, när körningen har avbrutits utan klart resultat
                         └─ unknown_outcome, när extern sidoeffekt inte kan avgöras
```

`cancelRequestedAt` är separat från slutstatus. Ett obekräftat stopp har kontrolläge `cancellation_unconfirmed`. Tillhörande repolås släpps inte förrän processen är bekräftat borta eller en säker återställningsåtgärd utförts.

Paus/resume införs endast för en adapter som har testat stöd. Att stoppa en OS-process är inte samma sak som en säker paus av alla dess barn och externa operationer.

## 4. Transaktions- och köprotokoll

1. Validera request, aktuell användarsession, taskversion och tillåten operation.
2. I en transaktion: jämför idempotensnyckel och innehållshash, spara job + första attempt + händelse/outbox.
3. Kvittera först efter commit. Samma request får samma jobb. Annat innehåll med samma nyckel ger konflikt.
4. En worker claimar ett berättigat jobb med lease och generationsnummer. Samtidigt kontrolleras repo- och resurslås.
5. Ompröva policy omedelbart före spawn. Avstängning medan jobb väntar ska gälla.
6. Starta tilldelad exekveringsgräns. Spara processidentitet och följ heartbeat.
7. Spara outcome och avslutshändelser transaktionellt. Publicera via outbox med event-ID så UI kan deduplicera.
8. Vid krasch: avstäm process, arbetskopia och externa operationer. Starta inte en ersättare medan ett gammalt arbete kan skriva.

En kö kan behandla en signal flera gånger. Systemets krav är att signalerna inte orsakar dubbel mutering utan kontroll, inte ett ogrundat löfte om “exactly once” över alla system.

## 5. API-semantik

Föreslagna nya kontrakt kan införas under `/api/v2` under migreringen. Befintliga kommandon, automationer och äldre dispatch-endpoints måste routas genom samma policy-/jobbgräns. Det får inte finnas en gammal genväg som kringgår kontrollerna.

| Operation | Semantik |
|---|---|
| `GET /api/v2/projects` | Projektlista, paginerad, källor och freshness |
| `POST /api/v2/tasks` | Skapa uppgift/inboxpost med server-ID och version |
| `PATCH /api/v2/tasks/:id` | Kräver förväntad version, konflikt i stället för lost update |
| `POST /api/v2/plan-proposals` | Skapa förslag utan att ändra agenda eller körkö |
| `POST /api/v2/dispatches` | Kräver idempotensnyckel och exakt taskversion. Returnerar accepterat job-ID |
| `POST /api/v2/runs/:id/cancel` | Begär stopp. Slutligt resultat kommer först efter stoppbevis |
| `GET /api/v2/runs/:id` | Livscykel, kontrolläge, bevis och verkliga capabilities |
| `POST /api/v2/approvals` | Specifikt tidsbegränsat beslut kopplat till innehållshash |
| `GET /api/v2/events` | Autentiserad ström med cursor och snapshotfallback |

Svarsklasser: 400 ogiltig indata, 401 oautentiserad, 403 otillåten, 409 versions-/innehållskonflikt, 429 resurs-/rategräns och 503 tillfälligt otillgänglig runner. Ett nätverksavbrott efter request kan betyda okänt utfall. Klienten frågar efter samma idempotensnyckel före ny dispatch.

## 6. Migrationsordning

**Steg 1:** inventera aktuell schemaversion och lokala data. Ta testbar backup. Inga destruktiva migrationssteg på den enda kopian.

**Steg 2:** lägg additiva tabeller/fält och läsbar kompatibilitetsadapter. Behåll legacy-events och runs för historik. Mappa legacy `done` till exekveringsframgång med okänd taskverifiering.

**Steg 3:** migrera logisk kö och nya körningar. Äldre `queued`/`running` får explicit legacy-/avstämningsstatus, aldrig automatisk återstart av gammalt uppdrag.

**Steg 4:** flytta anslutningar en i taget till avsett skyddat lager. Verifiera skrivning och läsning innan gammal data tas bort. Export får inte innehålla hemligheter i klartext.

**Steg 5:** byt UI-klient och interna dispatch-callers till samma nya kontrakt. Mät och jämför gamla respektive nya projektioner på testdata innan gamla skrivvägar stängs.

**Steg 6:** kör restore drill och rollback med den föregående appversionen eller dokumenterad kompatibel export. Automatisk downgrade får inte läsa ett inkompatibelt schema och fortsätta skriva.

## 7. Dokumentens sanningskälla

En aktiv kravspecifikation och ett aktivt maskinläsbart grindregister används. Äldre planer arkiveras med ersatt-status och länk till ny version. Projektinstruktioner ska bära aktuella invariants, inte kopior av hela roadmapen. Ingen ny fas markeras godkänd bara för att dokumenten har uppdaterats.


---

# Säkerhet, drift och återställning

## 1. Säkerhetsmål och begränsningar

Målet är att ett misstag, ett injicerat repo-dokument, ett nätavbrott eller en hängande agent ska vara begränsat, upptäckbart och återställbart. Det finns ingen rimlig garanti att en ensam dator, operativsystemet, providers och allt framtida innehåll blir helt felfria.

Hot från fullt komprometterad värddator, stulen administratörsbehörighet eller providerincident kan inte elimineras av dashboardens egna kontroller. Detta är residualrisker, inte skäl att hoppa över de kontroller som går att verkställa.

## 2. Tillitsgränser

| Gräns | Regel |
|---|---|
| Browser till API | Session, origin, Host, behörighet och requestvalidering provas separat |
| API till runner | Endast validerade jobb och tilldelade resurser, inget godtyckligt shell från frontend |
| Runner till workspace | Exakt arbetskopia, resurslås och verifierad exekveringsprofil |
| Arbetskopia till hemligheter | Förbjuden läsning med canarytest, inte enbart promptinstruktion |
| Provider till ADO | Versionsvaliderade events, begränsade strömmar, inga agentpåståenden som automatiska beslut |
| ADO till GitHub/deploy | Tydlig operation, minsta behövliga behörighet, specifikt godkännande |
| AI-text till UI | Data, inte exekverbart HTML eller betrodd instruktion |

Befintligt Host- och tokenlager ska behållas tills en testad ersättning tar över. SSE är inte oautentiserat i granskad kod. Däremot behöver token-i-URL och läsbehörigheterna omprövas före fjärråtkomst. [SRC09, SRC10](10_KALLOR_OCH_EVIDENS.md)

## 3. Tre exekveringslägen

**Read-only och handoff:** standard tills miljön är verifierad. ADO kan visa källor, förbereda uppgifter och exportera kontext. Läsning ska fortfarande begränsas till godkända datakällor.

**Supervised local:** ett uttryckligt, lokalt och övervakat läge för utvalda egna repos. Det märks som icke-isolerat om det saknar verifierad sandbox. Inga produktionscredentials, autonoma externa writes eller obevakad mobilstart. Det räknas inte som godkänd autonom körning.

**Sandboxed write:** får öppnas när avsedd provider-/OS-profil har klarat tester för filer, junctions/symlinks, nätåtkomst, processstopp och credentials. Tilldelad arbetskopia, minimal miljö och kontrollerade resurser gäller tillsammans. För obevakad skrivning används isolerad klon/snapshot om delad Git-metadata inte kan skyddas. En worktree får inte ge agenten en bakväg till originalets refs, hooks eller config. Ingen full tillgång till användarens hemkatalog eller alla GitHub-repos.

Vi implementerar inte en ny generell OS-sandbox. En befintlig dokumenterad säkerhetsmekanism ska verifieras. När en kombination saknar det stödet förblir den i ett mindre privilegierat läge.

## 4. Minsta behörigheter

| Handling | Föreslagen v1-policy |
|---|---|
| Läsa projektmetadata | Tillåten för autentiserad ägare inom valda projekt |
| Läsa källkod | Tilldelat repo och godkända filer, inte hela datorn |
| Redigera kod | Bara tilldelad arbetskopia i godkänd exekveringsprofil |
| Köra test/build | Godkänd profil och kommando, med timeout och resursslås |
| Installera dependencies | Separat risksteg. Lockfile och scripts granskas innan exekvering |
| Köra godtyckligt nätverkskommando | Inte tillåtet som standard |
| Läsa credentials eller oskyddade kunddata | Inte tillåtet |
| Skapa commit | På egen tilldelad branch när policy tillåter |
| Push eller skapa PR | Specifikt godkännande, riktad credential och contenthash |
| Merge till skyddad branch | Manuellt utanför autonom v1 |
| Deploy till produktion, signering eller betalning | Manuellt separat flöde, inte en bieffekt av agentens prompt |
| Ändra verifieringskrav eller säkerhetspolicy | Kräver separat mänskligt beslut och review |

En allowlist med kommandon löser inte ensam problemet. Ett tillåtet testkommando kan köra repoets ändrade scripts. Därför krävs även exekveringsgräns, få credentials och medveten hantering av installations-/Git-hooks.

## 5. Godkännanden och promptinjektion

Text från källkod, README, issues, webbsidor, terminalutdata och tidigare agentresultat är opålitlig. Den får inte öka behörigheter, ändra uppgiftens mål eller kringgå review. Markering som “data” i prompten är ett stöd, inte ett tekniskt skydd.

Servern beräknar ett kanoniskt operationsinnehåll och dess hash. Godkännandet anger exakt repo, bas/diff, operation och policyversion. En ändring efter godkännande gör beslutet oanvändbart. Servern måste utföra samma operation som användaren såg.

Säkerhetsfel är fail-closed. Valfria analyspaneler kan degradera, men en trasig policyläsning får inte byta till obegränsad agentkörning. Den äldre fail-open-hookprincipen får inte användas som gräns för privilegierade handlingar. [SRC01, SRC03](10_KALLOR_OCH_EVIDENS.md)

## 6. Credentials och anslutningar

Klartextlagret i granskad `ConnectionsStore` är inte målbilden. Fel vid läsning ska skilja saknad fil från korruption eller permissionsfel. Uppdatering ska vara återställbar och validera schemat. [SRC11](10_KALLOR_OCH_EVIDENS.md)

I Windowsappen används ett lämpligt plattformsstöddat skyddat lager och secret references. Electron safeStorage är ett möjligt byggblock, med dokumenterade OS-begränsningar. Det skyddar inte mot varje process som redan körs med användarens rättigheter. [SRC21](10_KALLOR_OCH_EVIDENS.md)

Auth-fakta visas var för sig: installed, configured, authenticated, authorized och reachable. Inloggningen till ett kodverktyg får inte förvandlas till en frikostig kopia av dess credential över alla barnprocesser.

## 7. Processer och resurser

Varje profil har en tidsbudget, logggräns, nätpolicy och resursbehov. Startvärdet är högst två körningar totalt och en skrivare per repo. Det är en försiktig designgräns, inte en benchmark av användarens dator.

Cancel skickar först ett stödjat mjukt stopp till rätt exekveringsgrupp. Efter en kort testad grace-period eskaleras stoppet. Windows behöver beprövad processträdshantering, exempelvis via en korrekt livscykelhanterad OS-mekanism. Implementation får inte nöja sig med att döda ett gammalt PID eller processnamn globalt.

Stdout och stderr konsumeras separat så att protokollet inte blandas ihop. Båda har storleks- och tidsgränser. Överskriden loggbudget markeras. Processen får inte låsa hela systemet därför att en loggconsumer stannar.

Tunga verktyg som Unity, signeringsverktyg och lokala emulatorer får egna resurslås. Windows-, macOS- och Linuxprofiler får inte påstå sig kunna samma byggtyper. iOS-bygg- och signeringsmiljö behöver verifieras separat innan stöd utlovas.

## 8. Mobil, sömn och frånkoppling

Privat transport, appauth och enhetsrevokering krävs tillsammans. Tailscale Serve är ett möjligt privat transportlager, inte en ersättning för appens behörighetsmodell. [SRC19](10_KALLOR_OCH_EVIDENS.md)

Ingen publik endpoint öppnas för att göra demot bekvämt. Inga långlivade adminhemligheter i en URL. Full mobilcache av kod, loggar och credentials är inte standard. Offlineutkast i v1 innehåller avsiktligt begränsad tasktext, märks osynkade och rensas enligt användarvald policy.

När datorn sover kan ingen ny lokal körning garanteras. “Utkast sparat på telefonen”, “accepterat i serverkön” och “startat på värddatorn” ska vara tre olika besked.

## 9. Backup och restore

Använd en konsistent SQLite-backupmetod. Att kopiera bara huvudfilen mitt i WAL-aktivitet är inte den planerade metoden. Den officiella backupmekanismen är ett relevant underlag, och ADO har redan en dokumenterad VACUUM INTO-väg som ska återprovas. [SRC01, SRC22](10_KALLOR_OCH_EVIDENS.md)

Föreslagen policy för den personliga v1-versionen:

- Backup av metadata minst dagligen och före schema-/appuppdatering, sju dagliga kopior plus fyra veckokopior när diskutrymme tillåter.
- Krypterad extern kopia är ett separat opt-in-val. Samma disk skyddar inte mot förlorad dator eller diskhaveri.
- Manifest med schema, appversion, källtidsstämpel, checksummor och artefaktreferenser.
- Credentials hanteras separat, aldrig i en okrypterad loggexport eller generell backupzip.
- Återställning provas på separat tom katalog med integritetskontroll, referenskontroll och start i icke-muterande läge.

**Planeringsmål:** högst ett dygns metadataförlust vid total värdförlust om daglig extern backup faktiskt är aktiv. Målet är inte garanterat utan fungerande backup. Återställningstid mäts under R4 och publiceras därefter.

GitHub skyddar bara pushad kod. Ej commitade eller ej pushade worktreeändringar kräver egna återställningsbara artefakter eller checkpoints. Automatisk cleanup får inte radera dem bara för att en process verkar inaktiv.

## 10. Drift och uppdatering

Före ny appversion: stoppa ny dispatch, invänta eller stoppa pågående mutationer, säkerhetskopiera, migrera testkopian, starta säkert, och kör smoke. Fungerande tidigare version och kompatibel restoreväg ska vara kända.

Signeringsstatus ska framgå utan instruktion att rutinmässigt kringgå OS-varningar. En intern testbuild som är osignerad ska inte marknadsföras som verifierat säker. Automatisk uppdatering kräver en betrodd distributionskedja och testad datamigrering. Electron-säkerhetsinställningar, IPC och navigation granskas separat. [SRC20](10_KALLOR_OCH_EVIDENS.md)

## 11. Incidentrutin

Stoppa ny dispatch för berört projekt, bevara arbetskopia och redigerade loggar, fastställ process-/repoidentitet och markera okända utfall. Välj sedan återställning, manuell granskning eller nytt försök. En automatisk fix får aldrig ändra produktion, radera bevis eller sänka verifieringskrav för att tysta incidenten.


---

# UX, planering och projektkontext

## 1. Informationsarkitektur

Återanvänd befintlig visuellt konsekvent komponentgrund. Flytta fokus från mängden paneler till användarens handling. UI-språket kan behållas som i befintlig app under första iterationen. Exemplen nedan förklaras på svenska och är inte ett beslut om en fullständig i18n-implementation.

| Primär vy | Huvudfråga | Prioriterat innehåll |
|---|---|---|
| Today | Vad behöver jag göra nu? | Högst tre nästa handlingar, godkännanden och kritiska blockerare |
| Projects | Var står mina produkter? | Mål, status, nästa steg, källa och roadmap |
| Inbox | Var lägger jag idéer? | Snabb fångst, osorterat, enkel koppling till projekt |
| Runs | Vad gör verktygen? | Runstatus, processläge, resurslås, logg, diff och bevis |
| Universe | Hur hänger saker ihop? | Valfri karta med filter och likvärdig listvy |

Settings, connections och diagnostics ska inte dominera startsidan. De äldre /command- och /ops-vyerna kan finnas kvar som sekundära vyer medan nya flöden provas. [SRC01, SRC03](10_KALLOR_OCH_EVIDENS.md)

## 2. Today: en prioriterad handlingsyta

Ordning: först sådant som kräver beslut, sedan något blockerande eller misslyckat, därefter nästa överenskomna uppgift. Allmän loggaktivitet visas lägre ned. Hög aktivitet i ett ointressant repo får inte knuffa bort dagens fokus.

Varje förslag visar handling, projekt, varför just nu och vad som saknas. En uppskattning kan visas som ett intervall eller okänd, aldrig en förment exakt tid utan data. “Fortsätt senaste” använder projektets verifierade handoff och markerar om kontexten blivit gammal.

Ingen generell project health-procent ska vara huvudsanningen. Faktiska dimensioner är tydligare: senaste byggets revision, kända blockerare, uppdaterad plan, pågående arbete och väntande review.

## 3. Projektvy

Överst: mål i en mening, fokus, nästa handling och statusens ålder. Under: roadmap, uppgifter, repo-/releasekällor och kontext. Logg och tekniska detaljer går att expandera.

För varje versionsfält anges vad det betyder. “Release 1.2” från GitHub betyder inte automatiskt att App Store visar 1.2. För plattformar som inte är integrerade ska det stå att versionen inte är kontrollerad där, inte återanvändas som en gissning.

Repoimport föreslår projektkoppling. Lika namn, flera checkouter och produktvarianter behöver explicit identitet. Ett projekt utan repo är fortfarande giltigt för en idé eller affärsplan.

## 4. Uppdrag och review

Skapaflödet har två nivåer. Inkorg kräver bara text. Dispatch kräver ett bestämt mål och tillräckligt kontrollerbara kriterier.

Granskaren ser: vad skulle ändras, vad ändrades, vilken revision testades, vilket test kördes, vilket resultat kom, vilka fel kvarstår och vilket nästa beslut krävs. Diff och bevis hålls tillsammans. Den gamla agentchatten kan ligga som referens men är inte huvudgränssnittet.

Start och godkännande är olika handlingar. Att godkänna en agentuppgift innebär inte automatiskt att godkänna dess framtida push, merge eller deploy.

## 5. Mobilens fyra kärnflöden

**Fånga:** skriv en idé direkt. Offline sparas den som ett markerat utkast. Inget grönt synkbesked förrän servern kvitterat.

**Välj:** se Today eller ett projekts nästa steg. Inga stora flerkolumnsvyer måste panorera horisontellt.

**Lämna uppdrag:** välj en förberedd uppgift och se repo, bas, policy och budget. Värdens onlinestatus behöver vara aktuell. En köad uppgift är inte startad.

**Granska:** läs sammanfattning och obligatoriska bevis. Om ändringen är för omfattande för rimlig mobilgranskning kan den sparas för datorn utan att pressa fram ett godkännande.

Mobilåtkomst ska inte implementeras genom att bara lägga en publik tunnel framför nuvarande server. Session och behörighetsflöde följer säkerhetsdokumentet.

## 6. Planeraren

### Steg A: bestäm vad som är berättigat

Filtrera efter aktivt projekt, användarens låsta åtaganden, blockerare, dependency-status, tillgänglig miljö och tidsfönster. Uppgifter som saknar avgörande kontext kan föreslås som en liten researchhandling men får inte automatiskt köras som implementation.

### Steg B: ordna förslag

Prioritera manuellt bekräftade åtaganden, därefter verkliga deadlines, sådant som häver viktiga blockerare och sedan användarens fokus. Underlagets ålder och osäkerhet ska synas. Det behövs ingen avancerad poängmodell som ger sken av precision.

### Steg C: förklara och invänta beslut

Visa högst tre val med varför de passar. Låt användaren byta fokus och låsa en uppgift. AI får föreslå en mindre del av ett stort arbete. Den får inte tyst skapa tjugo nya uppgifter eller flytta hela roadmapen.

### Steg D: återför verkligt resultat

Spara användarens val, faktisk tid när den finns, avbrott, verifieringsresultat och behov av omarbete. Denna data är mer värdefull än att räkna tokens som produktivitet. Frånvarande tidsdata ska inte fyllas med påhittade schabloner.

## 7. Kontextpaket utan vektordatabas

För v1 räcker versionsbunden sammanställning av godkända projektinstruktioner, task, relevanta filer, senaste handoff och verifierade blockerare. Använd namnsökning och avgränsad fulltextsökning där det finns behov.

Varje påstående i en sammanfattning ska kunna spåras till fil/commit, användarbeslut eller observation. Källkonflikt redovisas, den senaste AI-texten vinner inte automatiskt.

Sökningen exkluderar credentials, byggcache, node_modules, binära tillgångar och andra projekt om de inte uttryckligen är tilldelade. Både total datamängd och provider-kontekstbudget begränsas. Handoff lagras som en liten versionerad post, inte som kopior av alla chattar.

## 8. Universe

V1-noder: Project, Idea, Milestone och explicit ResourceReference. V1-relationer: belongs_to, depends_on, shares_resource och related_to. Relationer har källa och kan tas bort. Automatgenererade förslag märks tills användaren godkänt dem.

Grafen hjälper att upptäcka samband men får inte bestämma åtkomst. Ett samband mellan två projekt ger inte agenten rätt att läsa båda. Om grafen inte förbättrar verkliga val ska den förbli sekundär.

## 9. Tillstånd som måste designas

Loading, empty, ready, stale, offline, blocked, permission_denied, auth_expired, queue_waiting, cancellation_requested, cancellation_unconfirmed, awaiting_review och unknown_outcome.

Tomma ytor ska ge en sann enkel handling, exempelvis koppla ett repo eller lägg en första idé. Fel ska säga vad som inte fungerar och vad som fortfarande går att använda. Färg kan förstärka men inte ensam bära status.

## 10. Visuell verifiering

Testa 390, 768 och 1536 px, tangentbordsfokus, 200 procent zoom, lång projekttitel, långa felmeddelanden och minskad rörelse. Behåll befintliga screenshots för /command och /ops medan dessa vyer ändras, men lägg egna flödestester för nya primära ytor.

Demo-fixtures får bara finnas bakom ett tydligt demo-läge. Skärmbilder av dem får inte användas som bevis på verklig anslutning, arbetstid, kostnad eller testresultat.

## 11. Nyttoutvärdering

Mät på de tio pilotuppgifterna: tid att förstå nästa steg, handpåläggning mellan verktyg, missad kontext, antalet godkända resultat, omarbete och tid till underhåll av själva ADO.

Appöppningar är ett hjälpdatum, inte målvariabel. Den starkaste invändningen är att ADO blir ännu ett projekt som tar tid från produkterna. Piloten ska avgöra om arbetsytan faktiskt ger tillbaka mer uppmärksamhet än den kräver.


---

# Byggordning, grindar och öppna verifieringar



R0–R4 är en föreslagen ombaserad roadmap. De skriver inte över de gamla p0–p6-grindarna eller låtsas att öppna historiska tester är godkända. Inget i detta dokument utgör ett godkännande att starta implementation utan användarens nästa byggbeslut.



## Grindar



### R0 · Baslinje och vägval

**Status:** ej körd. **Föregående grind:** ingen.

Återställningsbar kopia, faktisk versionsinventering, befintlig teststatus och jämförelseflöden dokumenterade. Planens nya grindar ersätter inte historiska fakta.

**Testfall:** T40, T45.



### R1 · Säker lokal exekveringskärna

**Status:** ej körd. **Föregående grind:** R0.

Alla R1-tester passerar i avsedd miljö. Policy, kö, stopp och verifieringsstatus är tekniskt verkställda. Autonom skrivning förblir stängd om isolering inte bevisats.

**Testfall:** T05, T06, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T25, T26, T35, T37, T38, T43.



### R2 · Användbar projektarbetsyta

**Status:** ej körd. **Föregående grind:** R1.

Today, uppgifter, projektstatus, roadmap, kontext och liten Universe fungerar i tre valda pilotprojekt med verkliga källor.

**Testfall:** T01, T02, T03, T07, T08, T09, T10, T11, T34.



### R3 · Mobil och providerförmågor

**Status:** ej körd. **Föregående grind:** R2.

Privat mobilåtkomst och alla annonserade providerförmågor har verkliga tester. Ej tillgängliga extraproviders förblir tydligt avstängda.

**Testfall:** T04, T27, T28, T29, T30, T31, T32, T33, T42.



### R4 · Verifierad personlig v1

**Status:** ej körd. **Föregående grind:** R3.

Restore, Windows-paket, säkerhetsregressioner och verklig nyttopilot är godkända. Ingen runtimeförmåga är grön på enbart simulerade data.

**Testfall:** T36, T39, T41, T44, T46.



## Genomförbar backlog



Komplexitet anger relativt integrations-/riskarbete. Det är inte ett kalenderlöfte. Varje post kan delas i små vertikala ändringar, men får inte markeras klar utan angivna bevis.



### B01 · Fastställ baslinje och återhämtningskopia

**Grind:** R0 · **Komplexitet:** small · **Beroenden:** inga.

Inventera den aktuella arbetskopian och versionerna. Spara bas-SHA och backup innan ändringar. Jämför med den granskade snapshoten.

**Krav:** REQ21, REQ23. **Verifiering:** T40.



### B02 · Återskapa befintlig verifiering och Windows-smoke

**Grind:** R0 · **Komplexitet:** medium · **Beroenden:** B01.

Kör repoets befintliga verifiering och dokumentera vad som inte kan köras. Historisk CI ersätter inte lokala resultat.

**Krav:** REQ23, REQ24. **Verifiering:** T40.



### B03 · Besluta återbruk mot enklare arbetsflöde

**Grind:** R0 · **Komplexitet:** small · **Beroenden:** B01, B02.

Jämför tre representativa arbetsflöden i ADO och befintlig agentarbetsyta. R4 tar den fulla nyttopiloten. Förankra begränsad målbild och stäng gamla dokumentkonflikter utan att fejka gamla pass.

**Krav:** REQ24. **Verifiering:** T45.



### B04 · Inför exekverings- och verifieringsstatus

**Grind:** R1 · **Komplexitet:** medium · **Beroenden:** B03.

Inför separata statusbegrepp, migrationsmappning för gamla körningar och ärliga etiketter. AgentRun, Build och Task får inte blandas.

**Krav:** REQ04, REQ22. **Verifiering:** T05, T06, T37, T38.



### B05 · Säkra anslutningslagring och teknisk policy

**Grind:** R1 · **Komplexitet:** medium · **Beroenden:** B03.

Stoppa catch-all datareset, gör lagring återställbar och ersätt plaintext där plattformsvault stöds. Testa konfigurerad kontra autentiserad och fail-closed vid policyfel.

**Krav:** REQ15, REQ21, REQ22. **Verifiering:** T23, T24, T25, T35.



### B06 · Bygg beständig kö med idempotens och leases

**Grind:** R1 · **Komplexitet:** large · **Beroenden:** B04.

Databastransaktion för accepterat jobb, attempt, claim och outbox. Hantera kraschfönster och gammal cursor utan automatisk upprepning av externa sidoeffekter.

**Krav:** REQ11, REQ12. **Verifiering:** T15, T16, T17, T18, T43.



### B07 · Inför repoägarskap och isolerade arbetskopior

**Grind:** R1 · **Komplexitet:** large · **Beroenden:** B05, B06.

En skrivare per repo. Policy omprövas vid claim/spawn. Original skyddas. Autonomt läge kräver verifierad sandboxgräns, annars förblir det avstängt.

**Krav:** REQ09, REQ10, REQ15. **Verifiering:** T12, T13, T14, T19.



### B08 · Gör diagnostik och processtopp pålitliga

**Grind:** R1 · **Komplexitet:** large · **Beroenden:** B06, B07.

Begränsa och redigera båda utströmmarna. Stoppa tilldelat processträd med verifiering och bevara lås när stopp inte bekräftats.

**Krav:** REQ13, REQ14. **Verifiering:** T20, T21, T22, T23.



### B09 · Bind godkännanden till exakt operation

**Grind:** R1 · **Komplexitet:** medium · **Beroenden:** B04, B07, B08.

Spara beslut med repo, SHA/diffhash, operation och policyversion. Invalidera vid ändring. Merge och deploy förblir manuella utanför pilotautonomi.

**Krav:** REQ16, REQ04. **Verifiering:** T06, T26.



### B10 · Skapa projekregister med källor och identiteter

**Grind:** R2 · **Komplexitet:** medium · **Beroenden:** B09.

Behåll scanners metadata. Lägg separata produkt-/repo-/checkout-identiteter och visa källans färskhet. Importera metadata, inte allt kodinnehåll.

**Krav:** REQ01, REQ02, REQ20. **Verifiering:** T01, T02, T03, T34.



### B11 · Inför uppgifter, inbox och roadmap

**Grind:** R2 · **Komplexitet:** medium · **Beroenden:** B10.

Lokala planer ägs av ADO. Länka GitHub Issues utan dubbelriktad statussynk. Milstolpar har utgångskriterier och taskberoenden valideras.

**Krav:** REQ03, REQ05. **Verifiering:** T07.



### B12 · Bygg versionsbundet kontextpaket

**Grind:** R2 · **Komplexitet:** medium · **Beroenden:** B10, B11.

Använd godkända instruktioner, källfiler/commit, blockerare och tidigare verifierade resultat. Begränsa indexeringen och läck inte andra projekt.

**Krav:** REQ08, REQ15. **Verifiering:** T10, T11.



### B13 · Fokusera Today och Project-vyerna

**Grind:** R2 · **Komplexitet:** medium · **Beroenden:** B10, B11, B12.

Prioritera behov av användarbeslut och nästa handling. Återanvänd befintliga komponenter. Ingen full designomskrivning innan flödestest.

**Krav:** REQ02, REQ24. **Verifiering:** T03, T34.



### B14 · Lägg till förklarbar planering och liten Universe

**Grind:** R2 · **Komplexitet:** medium · **Beroenden:** B13.

Deterministisk kvalificering och mänsklig prioritering först. AI skriver förslag, inte auktoritativa scheman. Grafen är en valfri läsvy.

**Krav:** REQ06, REQ07, REQ24. **Verifiering:** T08, T09.



### B15 · Inför privat mobilanslutning och sessionssäkerhet

**Grind:** R3 · **Komplexitet:** large · **Beroenden:** B05, B09, B14.

Responsiva kärnflöden, privat HTTPS, enhetsparning, återkallning och offlineutkast. Ingen rå loopbackserver eller långlivad URL-token publiceras.

**Krav:** REQ17, REQ15, REQ03. **Verifiering:** T04, T27, T28, T29, T42.



### B16 · Inför providerkontrakt och verifiera Codex-spår

**Grind:** R3 · **Komplexitet:** large · **Beroenden:** B08, B09.

Behåll härdad befintlig adapter. Prova dokumenterat app-server-gränssnitt med versionspinning. Aktivera endast bevisade förmågor, ingen automatisk betald fallback.

**Krav:** REQ18, REQ19. **Verifiering:** T30, T31, T32, T33.



### B17 · Slutför användnings-, kvot- och kostnadsvisning

**Grind:** R3 · **Komplexitet:** small · **Beroenden:** B16.

Noll, okänt, uppskattat och rapporterat skiljs. Budget före betalt läge. Ingen fast procentsats eller falsk faktureringsprecision.

**Krav:** REQ19, REQ22. **Verifiering:** T32, T33.



### B18 · Verifiera backup, migrering och återställning

**Grind:** R4 · **Komplexitet:** medium · **Beroenden:** B06, B11, B12, B17.

Återställ på tom datakatalog, validera referenser och starta i säkert läge. Dokumentera förlustfönster för ej pushad kod separat från metadata.

**Krav:** REQ21. **Verifiering:** T35, T36, T37.



### B19 · Verifiera Windows-paket och verktygsresurser

**Grind:** R4 · **Komplexitet:** large · **Beroenden:** B15, B16, B18.

Testa avsedd Windowsinstallation, uppdatering, native-moduler och processadapter. Unity provas endast om det ska vara ett aktiverat supportpåstående.

**Krav:** REQ23, REQ09. **Verifiering:** T39, T44.



### B20 · Genomför nyttopilot och slutbeslut

**Grind:** R4 · **Komplexitet:** medium · **Beroenden:** B13, B14, B15, B17, B18, B19.

Samla riktiga resultat och handpåläggning över minst fem arbetstillfällen. Samtliga must-krav och aktiverade capabilities behöver bevis. Stoppa expansion om systemet inte minskar arbetet.

**Krav:** REQ24, REQ02, REQ04. **Verifiering:** T41, T42, T46.



## R0: exakt arbetsordning på avsedd maskin

R0 inventerar och verifierar innan nya produktfunktioner byggs. Börja i en separat kopia av rätt repo och lämna användarens ordinarie checkout orörd.

Läs först `CLAUDE.md`, eventuell `AGENTS.md`, `.claude/ops.yml`, `package.json` och aktuell lockfile. Dokumentera skillnader mot granskad commit. Kör inte okända installationsscripts bara för att ett README säger det.

Följande kommandon inventerar version och Git-läge i det öppnade repot:

```powershell
git rev-parse --show-toplevel
git rev-parse HEAD
git status --short
node --version
npm --version
Get-Command git,node,npm,codex,claude -ErrorAction SilentlyContinue |
  Select-Object Name,Source
```

Skriv inte ut hela miljön, authfiler eller osanerade remote-URL:er. Resultatet är lokal teknisk inventering, inte en uppmaning att publicera användarspecifika paths.

Efter granskat paket-/installationsunderlag i testkopian: följ repoets faktiska `npm ci`-/installationskrav och kör dokumenterad `npm run verify`. Läs nuvarande script först, eftersom plattform, native-moduler och eventuella Bash-beroenden måste fungera på Windows. Enstaka saknade verktyg ska rapporteras i stället för att tester hoppas över som godkända. [SRC01, SRC03](10_KALLOR_OCH_EVIDENS.md)

Öppna appens verkliga vyer, kontrollera laddning/fel/offline och prova en ofarlig uppgift i ett disponibelt testrepo. Credentials matas endast in genom verifierad lokal inloggning, aldrig i den här dokumentationen.

## Verifieringsluckor som kräver faktisk miljö

| Kontroll | Varför den avgör planen | Säker fallback |
|---|---|---|
| Aktuell Windows-/Node-/Electron-kombination | Native-moduler, processhantering och installerare kan inte bevisas genom text | Behåll läs-/planeringsläge tills stödd kombination är provad |
| Providerinloggning och capabilities | Dokumentation bevisar inte att användarens installation eller kvot fungerar | Visa unavailable, ingen dold API-fallback |
| Sandbox och canaryåtkomst | Worktree och prompts är inte isolation | Ingen autonom skrivning |
| Processträdsstopp | Fel process kan överleva eller felaktigt stoppas | Behåll lås och visa stopp obekräftat |
| Restore på separat katalog | Att en backupfil finns bevisar inte återställning | Ingen destruktiv migrering på enda datakopian |
| Telefon över privat nät | Host, cookies, proxy, viloläge och revokering måste fungera ihop | Lokal datoråtkomst, mobil-läsning först när auth är provad |
| Verklig nyttopilot | Ett fungerande verktyg kan fortfarande kosta mer tid än det sparar | Förenkla ADO eller återgå till enklare arbetsyta |

## Funktioner efter personlig v1

Först när R4 har verkliga resultat: ytterligare provider, fler hostar, större automation, sökförbättringar eller djupare Unity-/Expo-/releaseadapter. Varje utökning behöver nytt behov, kostnadsansvar, behörighetsmodell och testmatris.

Vektor-/grafdatabas, självmodifierande säkerhetsregler, modellmarknadsplats, generellt team-SaaS och 100 samtidiga agenter är parkerade. De ingår inte i leveranskravet för att detta system ska vara användbart.

## När arbetet ska stoppas

Stoppa beroende mutationer vid ej uppfylld säkerhetsgrind, oförklarad dataförlust eller okänd process-/sideeffectstatus. Stoppa expansion om piloten inte visar lägre nettofriktion. Stoppa vidare putsning när obligatoriska krav, användarflöden och kontroller är uppfyllda. Det finns inget slutlöst uppdrag att göra varje detalj perfekt.


---

# Acceptanstester och spårbarhet



**46 testfall. Samtliga är specifikationer och har status `not_run`.** Inget av dessa testfall har körts mot ADO i denna arbetsmiljö. Paketvalidering är en annan kontroll och ersätter dem inte.



T14 är ett villkor för att aktivera sandboxad autonom skrivning. T44 krävs innan Unity-profilen anges som stödd. En avstängd capability får inte marknadsföras som fungerande. Alla övriga tester gäller de föreslagna kärnflödena.



För varje utfört test ska bevis innehålla app-SHA, maskin/OS, runtime-/adapterversion, källdatum, fixtures eller förutsättningar, steg, faktisk observation och artefaktreferens. Screenshot ensam ersätter inte process-, auth- eller databasbevis.



## Kravtäckning



| Krav | Testfall |

|---|---|

| REQ01 · Entydig projekt- och repoidentitet | T01, T02 |

| REQ02 · Nästa steg och ärlig status | T03, T41 |

| REQ03 · Snabb idéinsamling | T04 |

| REQ04 · Verifierat resultat | T05, T06, T37 |

| REQ05 · Roadmap med beroenden | T07 |

| REQ06 · Planering med verklig kapacitet | T08 |

| REQ07 · Universe utan grafkrav | T09 |

| REQ08 · Versionsbundet projektminne | T10, T11 |

| REQ09 · En ägare av körningen | T12, T19, T44 |

| REQ10 · Isolering och skydd av original | T12, T13, T14 |

| REQ11 · Beständig körkö | T15, T16, T21, T43 |

| REQ12 · Idempotens och osäkra utfall | T16, T17, T18 |

| REQ13 · Pålitligt stopp | T20, T21, T31 |

| REQ14 · Begränsad och skyddad diagnostik | T22, T23 |

| REQ15 · Tekniskt verkställd åtkomst | T10, T14, T19, T23, T24, T25, T27, T29 |

| REQ16 · Specifika godkännanden | T06, T26 |

| REQ17 · Säker mobilåtkomst | T04, T27, T28, T29, T42 |

| REQ18 · Verkliga providerförmågor | T30, T31, T40 |

| REQ19 · Ärlig kostnads- och kvotkontroll | T32, T33 |

| REQ20 · Tydligt dataägarskap | T02, T18, T34 |

| REQ21 · Återställbar data | T24, T35, T36, T37 |

| REQ22 · Inga vilseledande mätvärden | T03, T05, T25, T33, T38, T43, T46 |

| REQ23 · Verifierad Windows-leverans | T39, T40, T44 |

| REQ24 · Mätbar användarnytta och användbarhet | T09, T41, T42, T45, T46 |



## Testfall



### T01 · Två nästan identiska reponamn

**Grind:** R2. **Krav:** REQ01. **Status:** not_run.

**Givet:** Två olika GitHub-repo-ID har liknande namn.

**När:** Båda importeras.

**Godkänt endast om:** Två separata identiteter behålls. Ingen task eller kontext flyttas mellan dem.

**Gäller:** always.



### T02 · Ändrad standardbranch

**Grind:** R2. **Krav:** REQ01, REQ20. **Status:** not_run.

**Givet:** Ett repos default branch heter Main eller en annan branch än main.

**När:** Bas för ett nytt arbete väljs.

**Godkänt endast om:** API:ts verifierade default branch används med exakt skiftläge och commit, aldrig en hårdkodad main.

**Gäller:** always.



### T03 · Gammal CI-information

**Grind:** R2. **Krav:** REQ02, REQ22. **Status:** not_run.

**Givet:** Senast kända gröna CI gäller en äldre commit.

**När:** Projektkortet visar en nyare commit.

**Godkänt endast om:** Den äldre körningen visas med SHA och ålder, inte som godkänd kontroll av nya koden.

**Gäller:** always.



### T04 · Offline-idé

**Grind:** R3. **Krav:** REQ03, REQ17. **Status:** not_run.

**Givet:** Mobilen saknar kontakt med värden.

**När:** En idé skrivs och sparas lokalt.

**Godkänt endast om:** UI visar osynkat utkast. Återanslutning skapar högst en serverpost med bekräftelse.

**Gäller:** always.



### T05 · Exit 0 utan verifiering

**Grind:** R1. **Krav:** REQ04, REQ22. **Status:** not_run.

**Givet:** Agenten avslutar med exit 0 men inga acceptanstester har körts.

**När:** Körningen avslutas.

**Godkänt endast om:** execution_status=succeeded men task_status=awaiting_review. Aldrig verifierat klar.

**Gäller:** always.



### T06 · Fel commit i testbevis

**Grind:** R1. **Krav:** REQ04, REQ16. **Status:** not_run.

**Givet:** Tester har passerat på commit A och koden ändras till B.

**När:** Godkännande eller färdigmarkering begärs.

**Godkänt endast om:** Beviset betraktas som utdaterat. Nya kontroller eller explicit dokumenterat undantag krävs.

**Gäller:** always.



### T07 · Beroendecykel

**Grind:** R2. **Krav:** REQ05. **Status:** not_run.

**Givet:** Task A beror på B.

**När:** B uppdateras till att bero på A.

**Godkänt endast om:** Transaktionen nekas och visar cykeln. Ingen halv uppdatering lämnas kvar.

**Gäller:** always.



### T08 · Begränsat tidsfönster

**Grind:** R2. **Krav:** REQ06. **Status:** not_run.

**Givet:** Användaren anger 30 minuter och en låst uppgift.

**När:** Planeraren föreslår nästa arbete.

**Godkänt endast om:** Förslaget respekterar fönstret och låset, visar osäker uppskattning och ändrar ingen kalender.

**Gäller:** always.



### T09 · Karta utan mus

**Grind:** R2. **Krav:** REQ07, REQ24. **Status:** not_run.

**Givet:** Samma portfölj finns i lista och Universe.

**När:** Användaren navigerar med tangentbord och på mobil.

**Godkänt endast om:** Alla projekt, samband och kritiska åtgärder är åtkomliga via listan utan panorering eller dragkrav.

**Gäller:** always.



### T10 · Manipulerad projektkontext

**Grind:** R2. **Krav:** REQ08, REQ15. **Status:** not_run.

**Givet:** Ett repo innehåller extern text som begär hemligheter eller andra projekts data.

**När:** Kontextpaket byggs och en agent får texten.

**Godkänt endast om:** Texten kan inte ändra policy, godkännanden eller tilldelade resurser. Canaryhemlighet exponeras inte.

**Gäller:** always.



### T11 · Föråldrat minne

**Grind:** R2. **Krav:** REQ08. **Status:** not_run.

**Givet:** Arkitekturanteckningens commit eller instruktionernas hash matchar inte aktuell bas.

**När:** Task förbereds.

**Godkänt endast om:** Kontexten markeras för ny kontroll och tidigare påstående behandlas inte som nyverifierad fakta.

**Gäller:** always.



### T12 · Samtidiga skrivare

**Grind:** R1. **Krav:** REQ09, REQ10. **Status:** not_run.

**Givet:** Två uppdrag mot samma repo och ett mot ett annat accepteras.

**När:** Schedulern försöker starta dem.

**Godkänt endast om:** Högst en skrivare i det första repot, högst två globalt. Det extra uppdraget väntar med tydlig anledning.

**Gäller:** always.



### T13 · Originalcheckout med osparade ändringar

**Grind:** R1. **Krav:** REQ10. **Status:** not_run.

**Givet:** Originalcheckout har lokala ändringar, untracked-filer och ett godtyckligt aktuell-branch-val.

**När:** Ett agentarbete förbereds och avbryts.

**Godkänt endast om:** Originalets filer, index, branch, refs, hooks och config är oförändrade. Ingen automatisk stash, reset eller clean körs.

**Gäller:** always.



### T14 · Utanför tilldelad filyta

**Grind:** R1. **Krav:** REQ10, REQ15. **Status:** not_run.

**Givet:** En sandboxad körning försöker läsa canary i annat repo, hemlighetsmapp och via symlink/junction, samt skriva i originalrepots gemensamma Git-metadata.

**När:** Åtkomstförsöken sker från agentens exekveringsverktyg.

**Godkänt endast om:** Alla otillåtna åtkomster nekas av exekveringsgränsen, inte bara av en prompt. Annars förblir autonomt läge stängt.

**Gäller:** before_enabling_sandboxed_write.



### T15 · Krasch efter accepterad köpost

**Grind:** R1. **Krav:** REQ11. **Status:** not_run.

**Givet:** Servern har kvitterat ett nytt jobb.

**När:** Processen kraschar före spawn och startas om.

**Godkänt endast om:** Jobbet finns kvar och kan återtas exakt en gång av en ny lease. Inga accepterade jobb försvinner.

**Gäller:** always.



### T16 · Krasch efter spawn

**Grind:** R1. **Krav:** REQ11, REQ12. **Status:** not_run.

**Givet:** En childprocess har startat men avslut har inte skrivits.

**När:** Servern kraschar och startar om.

**Godkänt endast om:** Processidentitet och lease avstäms. Ingen parallell ersättare startas utan fastställt säkert läge.

**Gäller:** always.



### T17 · Dubbel dispatch

**Grind:** R1. **Krav:** REQ12. **Status:** not_run.

**Givet:** Samma idempotensnyckel skickas två gånger med identiskt innehåll.

**När:** Båda förfrågningarna behandlas.

**Godkänt endast om:** Samma run-ID returneras. Nyckel med annat innehåll ger konflikt, inte ett nytt jobb.

**Gäller:** always.



### T18 · Oklart externt utfall

**Grind:** R1. **Krav:** REQ12, REQ20. **Status:** not_run.

**Givet:** En operation mot GitHub får timeout efter att motparten kan ha utfört den.

**När:** Återförsök övervägs.

**Godkänt endast om:** Det externa objektet söks via stabil identitet före nytt försök. Oklart resultat visas som unknown_outcome.

**Gäller:** always.



### T19 · Avstängning medan jobbet väntar

**Grind:** R1. **Krav:** REQ09, REQ15. **Status:** not_run.

**Givet:** Ett jobb ligger i kön.

**När:** Projektets dispatch stängs av före en ledig slot.

**Godkänt endast om:** Policyn kontrolleras igen före spawn och inget nytt arbete startar.

**Gäller:** always.



### T20 · Process med barn och barnbarn

**Grind:** R1. **Krav:** REQ13. **Status:** not_run.

**Givet:** Testprocessen startar två nivåer barn och ignorerar mjukt stopp.

**När:** Cancel begärs och grace-perioden löper ut.

**Godkänt endast om:** Hela tilldelade trädet stoppas eller läget markeras cancellation_unconfirmed och repolåset behålls.

**Gäller:** always.



### T21 · Förväxlad processidentitet

**Grind:** R1. **Krav:** REQ13, REQ11. **Status:** not_run.

**Givet:** Ett gammalt PID har återanvänts av en annan process.

**När:** Återställningsrutinen försöker stoppa den gamla körningen.

**Godkänt endast om:** Den orelaterade processen lämnas orörd. PID räcker aldrig som ensam identitet.

**Gäller:** always.



### T22 · Översvämmad stderr

**Grind:** R1. **Krav:** REQ14. **Status:** not_run.

**Givet:** En process skriver mer stderr än pipebuffertens storlek och fortsätter länge.

**När:** Runnern konsumerar loggarna.

**Godkänt endast om:** Ingen pipe-deadlock. Begränsad redigerad ring/spool, förlustflagga när gräns nås och begriplig felorsak.

**Gäller:** always.



### T23 · Hemlighet i felutdata

**Grind:** R1. **Krav:** REQ14, REQ15. **Status:** not_run.

**Givet:** Canarytoken finns i stdout, stderr, URL och providerfel.

**När:** Loggar, UI, export och felrapport skapas.

**Godkänt endast om:** Canary saknas i alla exporterade ytor. Rådata lagras inte som oavsiktlig fallback.

**Gäller:** always.



### T24 · Korrupt anslutningslager

**Grind:** R1. **Krav:** REQ15, REQ21. **Status:** not_run.

**Givet:** Anslutningsfilen innehåller trasig JSON eller läsning nekas.

**När:** Appen öppnas och en inställning försöker sparas.

**Godkänt endast om:** Ingen tom store skrivs över originalet. Fel skiljs från ENOENT och återställningsväg visas.

**Gäller:** always.



### T25 · Token finns men fungerar inte

**Grind:** R1. **Krav:** REQ15, REQ22. **Status:** not_run.

**Givet:** En anslutning har sparad men utgången credential.

**När:** Status visas och verifieras.

**Godkänt endast om:** Configured och authenticated skiljs. Credentialexistens räcker inte för Connected/Healthy.

**Gäller:** always.



### T26 · Godkännande för gammal diff

**Grind:** R1. **Krav:** REQ16. **Status:** not_run.

**Givet:** Användaren godkänner diffhash A.

**När:** Agenten ändrar diffen eller en annan action begärs.

**Godkänt endast om:** Godkännandet kan inte återanvändas. Servern avvisar operationen och ber om aktuellt specifikt beslut.

**Gäller:** always.



### T27 · Fientlig webb-origin

**Grind:** R3. **Krav:** REQ17, REQ15. **Status:** not_run.

**Givet:** En annan webbplats anropar API/SSE, försöker fel Host och fabricerar proxyheaders.

**När:** Läsning eller mutation begärs.

**Godkänt endast om:** Känslig data och mutation nekas. Host, origin, session och betrodd proxygräns prövas separat.

**Gäller:** always.



### T28 · Sovande eller stängd dator

**Grind:** R3. **Krav:** REQ17. **Status:** not_run.

**Givet:** Värddatorn går i vila under användning från telefonen.

**När:** Anslutningen försvinner.

**Godkänt endast om:** Senast känt läge märks stale/offline. Telefonen påstår inte att ett ej kvitterat uppdrag körs.

**Gäller:** always.



### T29 · Återkallad telefon

**Grind:** R3. **Krav:** REQ17, REQ15. **Status:** not_run.

**Givet:** En tidigare parad enhet har en giltig session.

**När:** Ägaren återkallar enheten.

**Godkänt endast om:** Efter nästa auktorisationskontroll får den inte läsa, starta eller godkänna arbete. Cachehantering följer sekretesspolicyn.

**Gäller:** always.



### T30 · Providerformat ändras

**Grind:** R3. **Krav:** REQ18. **Status:** not_run.

**Givet:** En adapter får okänd protokollversion eller okänt obligatoriskt event.

**När:** Körningen eller uppkoppling startar.

**Godkänt endast om:** Inget schema gissas. Version eller capability avvisas, råfel redigeras och gränssnittet visar begränsningen.

**Gäller:** always.



### T31 · Provider saknar resume

**Grind:** R3. **Krav:** REQ18, REQ13. **Status:** not_run.

**Givet:** Providerkonfigurationen saknar bevisat resumestöd.

**När:** Run detalj öppnas efter avbrott.

**Godkänt endast om:** Resume-knapp visas inte som fungerande. Retry skapar nytt försök med lineage och explicita risker.

**Gäller:** always.



### T32 · API-budget ej vald

**Grind:** R3. **Krav:** REQ19. **Status:** not_run.

**Givet:** API-betalt autentiseringsläge har ingen användarvald budget.

**När:** En betalande körning startas.

**Godkänt endast om:** Start nekas med budgetval, ingen dold fallback från abonnemang till API-betalning.

**Gäller:** always.



### T33 · Användningsdata saknas

**Grind:** R3. **Krav:** REQ19, REQ22. **Status:** not_run.

**Givet:** Provider levererar ingen usage eller prisunderlaget är gammalt.

**När:** Kostnadsraden beräknas.

**Godkänt endast om:** Okänd usage/kostnad visas som okänd. Uppskattning märks med datum/metod, aldrig fakturerat belopp.

**Gäller:** always.



### T34 · GitHub otillgängligt

**Grind:** R2. **Krav:** REQ20. **Status:** not_run.

**Givet:** Det finns lokal roadmap och senast känd repo-/CI-data.

**När:** API-anrop misslyckas eller rate-limit uppstår.

**Godkänt endast om:** Lokal plan är kvar. Extern data får egen staletid, backoff följs och inga aggressiva parallella retries startar.

**Gäller:** always.



### T35 · Skrivavbrott vid lagring

**Grind:** R1. **Krav:** REQ21. **Status:** not_run.

**Givet:** Inställningslagring avbryts eller disk blir full.

**När:** Nästa start läser lagringen.

**Godkänt endast om:** Senast konsistent tillstånd återfås. Databasmigration/JSON-ersättning får inte ge ett tyst tomt projekt.

**Gäller:** always.



### T36 · Full restore drill

**Grind:** R4. **Krav:** REQ21. **Status:** not_run.

**Givet:** Backup innehåller databas, planer, runreferenser och manifest, men inga okrypterade providerhemligheter.

**När:** Återställning görs i en separat tom datakatalog.

**Godkänt endast om:** Integritet och referenser kontrolleras och appen öppnas med rätt data utan att starta gamla mutationer.

**Gäller:** always.



### T37 · Migration av gammalt done

**Grind:** R1. **Krav:** REQ21, REQ04. **Status:** not_run.

**Givet:** Legacy runs har status done utan verifieringsbevis.

**När:** Nytt schema införs i testkopian.

**Godkänt endast om:** Historisk exekveringsframgång bevaras men task_verification blir unknown, inte automatiskt passed.

**Gäller:** always.



### T38 · Turntak kontra framsteg

**Grind:** R1. **Krav:** REQ22. **Status:** not_run.

**Givet:** Agenten har förbrukat 8 av 20 tillåtna turns.

**När:** Körningskortet renderas.

**Godkänt endast om:** Det står budget/turnförbrukning eller okänd framstegsgrad, aldrig att uppgiften är 40 procent klar.

**Gäller:** always.



### T39 · Windows första installation och uppdatering

**Grind:** R4. **Krav:** REQ23. **Status:** not_run.

**Givet:** Ren stödd Windows-miljö och därefter befintlig användardata.

**När:** Installerare, appstart och en versionsuppdatering provas.

**Godkänt endast om:** Native-moduler laddas, token/bootstrap fungerar, data bevaras, signeringsstatus framgår och rollbackväg är dokumenterad.

**Gäller:** always.



### T40 · Plattforms- och authinventering

**Grind:** R0. **Krav:** REQ23, REQ18. **Status:** not_run.

**Givet:** Den avsedda användardatorn och pilotrepo väljs explicit.

**När:** Versioner, CLI-auth och en kontrollerad testkörning provas.

**Godkänt endast om:** Stödd kombination dokumenteras utan att kopiera credentials. Saknad förmåga blir blockerare, inte antaget stöd.

**Gäller:** always.



### T41 · Praktisk nyttopilot

**Grind:** R4. **Krav:** REQ24, REQ02. **Status:** not_run.

**Givet:** Minst tio verkliga uppgifter från tre tydligt valda projekt genomförs över minst fem arbetstillfällen.

**När:** Resultat jämförs med användarens befintliga sätt att arbeta.

**Godkänt endast om:** Nettofriktion, omarbete, startsträcka och handpåläggning dokumenteras. Enbart appöppningar räknas inte som framgång.

**Gäller:** always.



### T42 · Responsivitet och tillgänglighet

**Grind:** R3. **Krav:** REQ24, REQ17. **Status:** not_run.

**Givet:** Testdata innehåller tomt, laddning, fel, offline och lång text.

**När:** Kärnflöden provas vid 390, 768 och 1536 px, tangentbord och 200 procent zoom.

**Godkänt endast om:** Ingen obligatorisk horisontell scroll i kärnflöden, inga blockerande consolefel och inga färgberoende statusbetydelser.

**Gäller:** always.



### T43 · SSE efter retention

**Grind:** R1. **Krav:** REQ11, REQ22. **Status:** not_run.

**Givet:** Klientens replaycursor är äldre än serverns bevarade eventintervall.

**När:** Klienten återansluter.

**Godkänt endast om:** Servern skickar ny auktoritativ snapshot och cursor. Inga tysta luckor maskeras som live.

**Gäller:** always.



### T44 · Tungt verktyg och resursslås

**Grind:** R4. **Krav:** REQ09, REQ23. **Status:** not_run.

**Givet:** Ett verifierat Unity-pilotprojekt har redan Editor eller build igång.

**När:** Ett andra inkompatibelt jobb schemaläggs.

**Godkänt endast om:** Projekt-/verktygslås hindrar samtidig konflikt. Detta test är obligatoriskt innan Unity-runner marknadsförs som stödd.

**Gäller:** before_enabling_unity_profile.



### T45 · Vägval före vidare implementation

**Grind:** R0. **Krav:** REQ24. **Status:** not_run.

**Givet:** Befintlig ADO och ett enklare alternativ jämförs på samma tre uppgifter.

**När:** Återuppta projekt, lämna avgränsat uppdrag och följa upp från mobilen provas där stöd finns.

**Godkänt endast om:** Skillnader, manuella steg och luckor dokumenteras. Fortsätt endast de ADO-delar som ger verkligt mervärde. Frånvarande funktion räknas inte som provad.

**Gäller:** always.



### T46 · Begränsat skal- och responstest

**Grind:** R4. **Krav:** REQ24, REQ22. **Status:** not_run.

**Givet:** 50 repo-metadataobjekt och 10 000 historiska events används på dokumenterad referensmaskin med warm lokal databas.

**När:** Cached startsida öppnas och 30 definierade UI-handlingar genomförs utan externa API-latenser.

**Godkänt endast om:** Föreslaget mål: första användbara lokala vy under 2 s och lokal återkoppling p95 under 200 ms. Ingen obunden logg-/minnestillväxt vid upprepning. Riktiga mätvärden och miljö bifogas.

**Gäller:** always.



## Bevis får inte förfalskas av testdesignen

En fejkad provider i ett enhetstest bevisar det interna tillståndsflödet, inte att riktig provider fungerar. En loopbackbrowser bevisar rendering, inte privat mobilåtkomst. Att döda en enkel childprocess bevisar inte att en Windowsprocess med barnbarn stoppas. Ett schema som accepterar JSON bevisar inte att en server upprätthåller behörigheter.

Testdubblar används för deterministiska fel, tidsgränser och dubbletter. Minst en verklig körning krävs för varje annonserad provider-/OS-/authkombination. Säkerhetstester använder disponibla repos och ofarliga canaryvärden, inte användarens riktiga hemligheter.

## Felklassning

- **Fail:** observerat beteende bryter mot kriteriet.
- **Blocked:** miljö eller behörighet saknas för att göra testet.
- **Inconclusive:** observationen avgör inte kriteriet.
- **Not run:** inte utfört.
- **Pass:** angivet kriterium har ett relevant bevis för rätt version.

Blocked, inconclusive och not_run räknas inte som pass. Ett underkänt obligatoriskt test ska rättas, eller den berörda capabilityn hållas avstängd med en uttrycklig scopeändring. Tester ska inte försvagas för att få grön rapport.


---

# Bygghandoff till nästa utvecklingssession

## Startprompt: endast R0

Kopiera texten nedan tillsammans med detta paket när användaren uttryckligen vill börja nästa steg. Den beställer baslinje och verifiering, inte ett oavgränsat bygge.

```text
Arbeta med befintliga Wrexist/ADO. Skapa inte ett nytt ControlOS-projekt.

Läs först aktuell CLAUDE.md, eventuell AGENTS.md, GOALS.md, ROADMAP.md,
.claude/ops.yml, TASK.md och relevanta implementationer. Jämför faktisk HEAD
med granskad snapshot bb19caba68c1cda13249c8d722a9b6647133dc8f.
Paketets uppgifter är en historisk källgranskning och föreslagna mål,
inte bevis för din aktuella arbetskopia.

Läs sedan 00_LAS_MIG.md, 02_AUDIT_NULAGE.md och
07_BYGGORDNING_OCH_GRINDAR.md. Utför bara R0: B01, B02 och B03.
Bevara originalcheckout, osparade ändringar, credentials och användardata.
Arbeta i separat testkopia. Starta inga produktionsdeploys, API-betalningar,
nya externa integrationer eller obevakade agentkörningar.

Inventera faktisk OS/runtime, paketversioner, providerinstallation och
auktorisationsläge utan att visa secrets. Läs installationsscripts före körning.
Kör repoets befintliga verifiering i avsedd miljö och dokumentera även blockerade
eller misslyckade kontroller. Starta verklig UI när möjligt och kontrollera
befintliga /command och /ops visuellt. Påstå inte att Windowsstödet fungerar
bara för att Linux-CI var grön.

Reproducera viktiga fynd i disponibla fixtures utan att riskera riktig kod:
spärr efter enqueue, dubbla dispatches, exit 0 utan acceptansbevis, stderrflöde,
originalcheckout med lokala ändringar och korrupt anslutningsfil.
Ändra inte tester eller policy för att dölja brister.

Jämför tre konkreta arbetsflöden mot ett enklare tillgängligt alternativ:
återuppta ett projekt, lämna en avgränsad uppgift och följa upp från mobilen.
Säg exakt vad som är provat, saknas eller inte kan avgöras.

Leverera en R0-rapport med bas-SHA, versionsinventering, reproducerade fynd,
exakta kommandon och utfall, visuella bevis där de finns, återställningsväg,
rekommenderad avgränsning och vad som blockerar R1. Markera ingen grind grön
utan relevant evidens. Stanna efter R0 och börja inte bygga nästa fas.
```

## Arbetskontrakt när en enskild byggpost senare godkänns

```text
Genomför endast angiven backlogpost Bxx och nödvändiga beroenden som redan
är godkända. Läs motsvarande krav, ADR, säkerhetsregler och acceptanstester.
Inventera relevanta callsites så att gamla endpoints, automationer och interna
funktioner inte kan kringgå nya kontroller.

Gör minsta hållbara förändring, följ befintliga mönster och använd inte nya
beroenden utan påvisat behov. Behåll kompatibilitet där det är säkert.
Separera datamigrering och kodändring när det underlättar återställning.

Visa inte fungerande features med mockdata som om de vore verkliga.
Kör relevanta unit-/integrationstester och riktiga plattformstester där
capabilityn kräver det. Granska förändrat UI visuellt enligt projektets regler.
Rapportera vad som verkligen är implementerat, testat och fortfarande blockerat.

Skriv evidens med rätt SHA och versionsinformation. Uppdatera aktivt
krav-/grindregister och projektets ordinarie arbetslogg, men bevara historik.
Sänk inte säkerhetskrav eller nollställ användardata för att få ett grönt test.
Inga auto-merges, produktionsdeploys eller nya betalande API-lägen.
```

## Format för leveransrapport

Ange backlogpost och resultat, därefter ändrade gränser/filer, migrationspåverkan, testkommandon med faktisk utgång, artefakter och kvarstående risker. Avsluta med en av tre tydliga bedömningar: uppfyller kriterier, blockerat av specificerad kontroll eller kriterierna underkända.

En stor modell, lång prompt eller fler granskningsagenter ersätter inte detta arbetskontrakt. En ensam implementerare med relevant testning och oberoende review är standard. Fler samtidiga agenter används bara när arbete och resurser verkligen är oberoende.


---

# Källor, evidens och granskningsgräns



Granskad 2026-09-26. Repoets källor avser commit `bb19caba68c1cda13249c8d722a9b6647133dc8f`. Primärkällornas uppgifter kan ändras efter detta datum. Teknikval och mål i paketet är rekommendationer, inte påståenden om redan implementerad funktion.



## Källregister



### SRC01 · ADO README

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/README.md

Granskningsomfattning: Projekt, stack, befintlig implementation och dokumenterade begränsningar.



### SRC02 · ADO GOALS

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/GOALS.md

Granskningsomfattning: Ursprungliga mål, mobil uttryckligen utanför v1, nytto- och fasgrindar.



### SRC03 · ADO projektinstruktioner

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/CLAUDE.md

Granskningsomfattning: Befintliga konventioner, Node-baslinje, verifiering och visuella kontroller.



### SRC04 · ADO uppgiftslogg

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/TASK.md

Granskningsomfattning: Dokumenterad fas 6 och ej avslutade verkliga kör-/användningsgrindar. Delar granskade, inte hela historiken.



### SRC05 · ADO masterplan

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/docs/MASTER_PLAN.md

Granskningsomfattning: Arkitektur och överlappande V2/V3-tillägg.



### SRC06 · ADO fasmanifest

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/.claude/ops.yml

Granskningsomfattning: Grindstatus, föråldrade antaganden och körkriterier.



### SRC07 · ADO runner

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/apps/server/src/runner/index.ts

Granskningsomfattning: Hela filen granskad i två delar. Kö, behörighetskontroll, körstatus, procent och avbrott.



### SRC08 · ADO process-start

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/apps/server/src/runner/spawner.ts

Granskningsomfattning: Claude-start, miljövariabler, ignorerad stderr, SIGTERM på barnprocess.



### SRC09 · ADO säkerhetslager

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/apps/server/src/security.ts

Granskningsomfattning: Host-allowlist, muteringsautentisering och SSE-token.



### SRC10 · ADO server

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/apps/server/src/app.ts

Granskningsomfattning: Endast rad 1–245 granskad. CORS, SSE, loggredigering och bootstrap, inte samtliga endpoints.



### SRC11 · ADO anslutningslager

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/apps/server/src/connections/store.ts

Granskningsomfattning: JSON-baserad lagring, generell felhantering, filskrivning och connected-flagga.



### SRC12 · ADO databasmodell

Källa: https://github.com/Wrexist/ADO/blob/bb19caba68c1cda13249c8d722a9b6647133dc8f/apps/server/src/db/schema.ts

Granskningsomfattning: Befintliga events, samples, jobs, runs och reserverat verifyVerdict.



### SRC13 · Historisk CI

Källa: https://github.com/Wrexist/ADO/actions/runs/29690231132

Granskningsomfattning: GitHub API rapporterade success för granskat SHA den 19 juli 2026. Ingen ny testkörning utförd.



### SRC14 · Node.js release-status

Källa: https://nodejs.org/en/about/previous-releases

Granskningsomfattning: Node 20 listas EOL, Node 24 listas LTS vid granskningen.



### SRC15 · Codex app-server

Källa: https://developers.openai.com/codex/app-server

Granskningsomfattning: Officiellt integrationsprotokoll. Stdio och versionsmatchade scheman är relevanta för en möjlig adapter.



### SRC16 · Codex autentisering

Källa: https://developers.openai.com/codex/auth

Granskningsomfattning: Skiljer abonnemangsinloggning från API-nyckelbaserad användning.



### SRC17 · T3 Code

Källa: https://github.com/pingdotgg/t3code

Granskningsomfattning: Extern agentarbetsyta att jämföra med. Ingen stabil ADO-integrations-API har verifierats.



### SRC18 · Git worktree

Källa: https://git-scm.com/docs/git-worktree

Granskningsomfattning: Flera arbetskopior av samma Git-repository. Inte i sig en OS-sandbox.



### SRC19 · Tailscale Serve

Källa: https://tailscale.com/docs/reference/tailscale-cli/serve

Granskningsomfattning: Privat åtkomst inom tailnet. Ska inte förväxlas med publik Funnel.



### SRC20 · Electron security

Källa: https://www.electronjs.org/docs/latest/tutorial/security

Granskningsomfattning: Säkerhetsprinciper för Electron, IPC och webbinnehåll.



### SRC21 · Electron safeStorage

Källa: https://www.electronjs.org/docs/latest/api/safe-storage

Granskningsomfattning: Plattformsberoende skydd för lokal hemlighetslagring. Inte skydd mot alla processer under samma OS-identitet.



### SRC22 · SQLite backup

Källa: https://sqlite.org/backup.html

Granskningsomfattning: Konsistent säkerhetskopiering av en aktiv SQLite-databas.



## Evidensnivåer

**Användarmål:** önskemålet att enklare arbeta över flera projekt, och den föregående planens produktvision. Historik används som bakgrund, inte som ersättning för dagens kod.

**Statisk kodobservation:** det angivna uttrycket eller kontrollflödet finns i läst källa. Det bevisar inte att varje tänkbart fel redan inträffat.

**Historisk CI-observation:** GitHub API rapporterar status för ett bestämt äldre SHA. Det bevisar inte dagens maskin, credentials eller integrationer.

**Dokumenterad produktförmåga:** tillverkarens/verktygets officiella beskrivning. Det är inte ett pass för användarens installation.

**Föreslagen design:** krav, begränsningar, mål, ADR:er och testfall som detta paket föreslår.

**Ej verifierat:** dagens kompletta build, Windowsinstallation, providerinloggning, sandbox, verkliga agentsessioner, telefonkoppling och restore drill.

## Utförda och icke utförda åtgärder

GitHub-anslutningen användes för sökning och läsning. Ingen write-operation användes. Ingen användarcredential hämtades. Repoets källkod kunde inte klonas/laddas ned till körmiljön för en fullständig ny verifiering. Ingen lokal applikation kördes därför här.

Paketets eget kontrollskript provar dokumentlänkar, identiteter, beroendegraf, testtäckningsreferenser och JSON-kontrakt. Dess resultat är en kvalitetskontroll av förarbetets struktur, inte en säkerhets- eller funktionstestning av ADO.
