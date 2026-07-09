# DESIGN_SPEC.md — 1:1 recreation of the reference images

Save the two reference PNGs into the repo at `design/reference/view-a.png` (Command Center) and `design/reference/view-b.png` (Ops Dashboard). During Phase 1, Claude Code must keep them open side-by-side with its output — the gate is a visual match, not "inspired by".

## Design tokens (`packages/shared/tokens.ts` + Tailwind config)

```
Color
  bg-app        #0A0A12      page background (near-black, blue-violet cast)
  bg-panel      #0F0F19      sidebar / right rail
  bg-card       #14141F      cards
  bg-elevated   #1B1B29      inner tiles, inputs, hover
  border        rgba(255,255,255,0.07)   1px everywhere; 0.12 on hover
  text-1        #F4F5FA      headings, values
  text-2        #9CA0B4      labels, descriptions
  text-3        #5E6274      timestamps, hints
  primary       #7C5CFF      violet — buttons, active nav, focus
  primary-2     #A855F7 → #EC4899   progress-bar gradient (violet→pink)
  success       #22C55E      Active dots, Operational, green progress
  warning       #F59E0B      Testing/queued states, amber progress
  info          #38BDF8      cyan accents (UI Generator, network chart)
  danger        #EF4444      alerts badge

Type   Inter (or Geist). Sizes: 24/28 page title · 15 section titles ·
       13 body · 11 labels/uppercase eyebrows · 26–28 semibold stat values
       with tabular-nums. Weights 400/500/600 only.

Shape  radius 16 cards · 10 inner tiles/inputs · full pills.
       Shadows near-none; separation comes from bg steps + borders.

Motion 150ms ease on hover (border + bg lift) · progress bars animate
       width on load · live values fade-swap. Nothing else — the
       reference look is calm. Respect prefers-reduced-motion.
```

Signature element (both views): the **violet→pink gradient progress bar** — it's the one loud element; everything else stays flat and quiet. Don't add glows, don't add extra gradients.

## View A — Command Center (image 1)

Layout: 3 columns. Sidebar 224px fixed · main fluid (min 640) · right rail 360px. Top bar 64px spans all.

- **Top bar**: logo mark + "AI Control Center / Command everything. Build anything." · centered search pill with ⌘K chip · right: [+] [calendar] [bell w/ violet badge "3"] [avatar w/ green presence dot]
- **Sidebar** groups (11px uppercase eyebrows): WORKSPACE (Repositories `12`, Games `5`, Agents `8`, Templates, Secrets & Keys, Integrations) · AI TOOLS (Code Assistant, Game Builder, UI Generator, Database, Analytics) · DEPLOY & RELEASE (Deployments, CI/CD Pipelines, Releases) · SETTINGS (Workspace Settings, Team, Billing). Active item: violet-tinted pill. Count badges: bg-elevated pills
- **Header row**: "Welcome back, Isac! 👋" + subtitle · right: 3 layout-toggle icon buttons (first active) + violet **+ New** button
- **Stat cards ×4** (equal row): label 13/text-2 · value 28 semibold · delta line (↑ green "2 this week" · ↓ amber for tokens) · tinted icon tile right (violet/green/blue/amber)
- **All Repositories**: title + filter tabs `All (12) · Games (5) · Apps (4) · Libraries (3)` (active = elevated pill) + right "Sort: Recently Updated ⌄" + grid toggle. **3×2 card grid**, each card: icon tile + name + tag pill (Game/App/Web/API/Library) · status dot + "Active" + ⋮ · one-line description text-2 · meta row: ⑂ main | Updated Xh ago · progress row: label + green ✓ + gradient bar + "100%" · avatar stack (+N). Below: full-width "View all repositories →" bar
- **Running Agents** strip: title + "View all agents →" · 5 tiles: icon + name + one-line status ("Analyzing code…") + slim progress bar + % (colors: green/violet/cyan/amber/pink)
- **Right rail**, 4 stacked cards: **AI Command Center** ("Ask anything. AI will handle it." + input "What do you want to build or fix?" + violet send button) · **Recent Activity** (6 rows: icon tile, title, one-line detail, right-aligned time; "View all activity →") · **System Status** (4 rows: name left, "Operational" + green dot right) · **Need help?** violet-tinted card + "Open AI Assistant" button

## View B — Ops Dashboard (image 2)

Layout: sidebar 200px · main = 12-col grid, 3 content columns ≈ 5/4/3.

- **Top bar**: "AI CONTROL / DASHBOARD" logo block · right: search pill ⌘K, bell w/ red dot, chat, settings, avatar
- **Sidebar**: WORKSPACE (Repositories, Games, Apps, Websites, Services, Databases, Secrets) · AI TOOLS (AI Agents, Automation, Workflows, Prompts, Models) · MONITORING (Analytics, Logs, Alerts, Performance) · SETTINGS (Team, Integrations, Settings) · bottom **Pro Plan** card with Upgrade button
- **Header**: "Good morning, Isac 👋" + "Everything looks great. 12 projects active." · right: violet **New Project** + outlined **AI Assistant** buttons
- **Stat cards ×5**: Repositories 23 (↑3, GitHub icon) · Active Builds 8 (radial ring) · AI Agents 12 (green sparkline, "All systems active") · Deployments 15 (↑5 today) · System Health 98% "Excellent" (green-tinted card + sparkline)
- **Col 1**: **Projects Overview** — tabs All/Repositories/Games/Apps/Services · rows: icon, name + subtitle, language dot+name (TypeScript blue / Swift orange / Liquid teal / Python yellow), ★ count, ⑂/PR count, right status chip (● Building 2m15s / ● Deploying / ● Live v2.4.1 / ● Testing 12 tests), ⋮ · "View all repositories". **Build Queue** — rows: icon, name + "#142 Build and Test", branch chip (`main`/`develop`), right duration or "Queued"
- **Col 2**: **Activity Feed** (icon tile, event, detail, time) · **AI Agents** (Manage all): Code Review Agent "Analyzing 5 PRs" ● Active · Bug Finder ○ Idle-style · Performance · Security — then dashed "+ Add new agent"
- **Col 3**: **AI Assistant** (input + 4 chips: Analyze codebase · Fix bugs · Optimize performance · Generate tests) · **System Monitor** (View full metrics): CPU 32% blue / Memory 68% violet / Network 42% green mini area charts · **Quick Actions** 2×3 icon grid (Create Repository, New AI Agent, Deploy Application, Run Workflow, View Analytics, Manage Secrets) · **Recent Deployments** (View all): name + env chip (Production green / TestFlight blue / Staging amber) + time + green check

## Rules for the build

- Real data replaces the mock **values**, never the mock **layout** — grids and cards keep dimensions when counts change (empty slots get honest empty-states, Phase 6)
- Numbers on screen only from bus events (data-integrity module); sparklines only once ≥2 real samples exist, otherwise a flat "collecting data" line — never an invented curve
- The reference shows fake teammate avatars and demo project names (Elitklockor, Vivoria, Deep Life Simulator): recreate the components 1:1, populate with YOUR portfolio (SENTINEL, Dynasty Manager, tower-defense, Atlas, Singularity Inc) and agent avatars
- Quality floor: keyboard focus visible, ⌘K opens search, reduced-motion respected, no layout shift on live updates

## V2 amendments

- **Build order inside Phase 1**: the shared kit comes first — Card, StatCard, GradientProgress, StatusDot, Chip, FeedRow, AgentTile, Sparkline, RadialRing, SectionHeader, IconTile, AvatarStack. Views only compose kit components; a view-specific one-off must be promoted into the kit before use
- **Canonical viewport**: 1536px (the reference width). Graceful to 1280; below that horizontal scroll. No mobile in v1
- **Charts**: custom SVG (Sparkline, RadialRing, MiniArea) in the kit — no charting library
- **Font**: @fontsource/inter, self-hosted (must render offline)
- **Regression protection**: at Phase-1 sign-off, capture Playwright screenshots of both views as baselines; Phase 6 wires a visual diff into verify so later phases can't silently break the 1:1 match
