# Porting notes: built-in → external app

This repository was ported from Kiro Crew's built-in Mochi at KiroCrew `main`
`5ec3b81677`. The last commits touching the app there are `9591e0c21b`
(backend), `46e373f1a1` (the page and its shared modules) and `433d99bf2f`
(desktop shell code):

- the backend, `src/kiro_crew/apps/builtins/mochi/` (`app.json`, `hooks.py` and
  the twenty modules beside it, `backend/routes.py`, `mcp_server.py`, `agents/`
  with its two agent specs, the behaviour prompts and the six skills);
- the dashboard page, `website/src/apps/mochi/MochiPage.tsx` and the modules it
  imports (`api.ts`, `dashboardData.ts`, `i18nKeys.ts`, `mochiHelpers.ts`,
  `builtinPacks.ts` with its animation assets, and six modules of `src/shared/`),
  and its store art, `website/public/app-assets/mochi/`;
- the groups of the `apps.mochi.*` strings of `website/src/i18n/locales/*.json`
  the page names, and the listing copy of `apps.mochi.manifest`;
- the tests: the built-in's own `tests/test_*.py`, Kiro Crew's
  `test/test_mochi_*.py`, and the page's tests (`website/src/test/MochiPageCoverage.test.tsx`
  and the page-module tests under `website/src/apps/mochi/`).

Not ported here: the five desktop windows (`pet`, `panel`, `settings`, `avatar`
and `snip` under `website/src/apps/mochi/`) and the desktop shell code that draws
them (`website/electron/mochi/`). Kiro Crew keeps serving both; see "The desktop
windows" below.

Paths below refer to that commit. A **gap** is something the built-in gets from
Kiro Crew that an external app has no public way to get yet; closing one is a
Kiro Crew change (a generic, app-agnostic App Kit seam), not a change here.

## What carried over unchanged

- `app.json` `name` (`mochi`), `author`, `permissions` (the API grant, storage,
  the fifteen events, cron, spawn and the three `desktopCapabilities`),
  `platform` (including `requiresDesktopApp`), `defaultEnabled: false`, `tags`,
  `agents`, `skills` and every display field (`displayName`, `description`,
  `highlights`, `useCases`, `configuration`). `tests/test_manifest_contract.py`
  compares them with the built-in's manifest (`tests/fixtures/builtin-app.json`),
  because adoption refuses a manifest that widens a grant or forces the app off.
  No grant is added. The `version` was the built-in's `0.1.0` at the port; a
  Kiro Crew release that pins this repository moves the wheel copy's version to
  the released one, as adoption requires.
- The owner loop and every module it drives, file for file at the same paths
  (`hooks.py`, the behaviour queue and its poller, the watch list, pinned files,
  stats, idle and presence, the notification gate, the pet state machine, the
  appearance store, the PetDex importer, the redactor, the soul loader and the
  MCP reach policy), with their imports changed. The data location is the same:
  the gateway hands an app's hooks `ctx.data_dir = <data home>/apps/mochi/data`,
  the directory the built-in's hooks were handed, so the queue, the watch list,
  the pins, the stats, the settings, the imported packs and the colour map are
  read as they are. Nothing of the built-in lived beside `app.json`.
- Every route's method, path, validation, status codes, error `code`s and
  response shape, the built-in's own enabled check and 503 `runtime_not_started`,
  and the owner-only rule for every write (`tests/test_routes_table.py` pins the
  table, method for method and in order). The handler bodies are the built-in's.
- The two agents (`mochi`, `mochi-bg`) and the six skills, byte for byte, so the
  materialized agents are the ones a user already has, and the MCP reach policy
  the owner loop writes to `data/agent_mcp_policy.json` is read by the same
  agent materializer.
- The MCP server's name (`mochi`, so its tools stay `@mochi:mochi/...`), its
  eight tools and their schemas, the data files it reads and writes, and its
  audit through the host's `call_tool_with_logging`.
- The page, `MochiPage.tsx` and its modules, with the import paths below changed.
- The events the owner loop publishes, through `ctx.events`, under the same names.

## What changed, and why

| Built-in | Here | Why |
|---|---|---|
| `"backend": {"routes": "backend.routes:register_routes", "hooks": {"on_startup": "hooks:on_startup", ...}}` (`app.json`) | `"backend": {"hooks": {"routes": "backend.routes:register_routes", "on_startup": "backend.lifecycle:on_startup", "on_shutdown": "backend.lifecycle:on_shutdown"}}` | Top-level `backend.routes` is read only by the built-in boot loop. An external app's routes go through the gateway's `RouteRegistry`, which also serves them only while the app is enabled. |
| The lifecycle hooks in `hooks.py`, which also holds the runtime (`_runtime`) the routes read | `backend/lifecycle.py`, a two-function entry that calls `hooks.on_startup` / `hooks.on_shutdown` | The gateway loads each hook entry by executing its file into a FRESH module, so a hook entry cannot hold state the routes read. `hooks.py` is named by no entry, so the lifecycle entry and the routes share one copy of it (`tests/test_hook_loading.py`, through the gateway's own loader and dispatcher). |
| `register_routes(app)` adding aiohttp routes under `/api/apps/mochi` (`backend/routes.py:1047-1096`) | `register_routes(ctx)` returning `Route(method, path, handler)` records relative to that base | The registry's structural route records. Each handler is the built-in's, wrapped to take the registry's `(request, ctx)`. |
| `require_owner_dashboard_request(request, "mochi.<op>")` from `kiro_crew.dashboard.handlers._shared` (`backend/routes.py:93`, `:161`) | `ctx.require_owner(request, "<op>")` (`_host.require_owner`) | The host's public owner gate: the same rule, the same 403 `owner_only`, and the same audit operation `mochi.<op>` (the host prefixes the app's name). An app token still passes as it did. A gateway without the seam refuses every write. |
| The settings, pack and PetDex routes answered while the app was off (`backend/routes.py:1077-1085`) | the registry serves no route while the app is off (404) | The registry deregisters an app's routes on disable. Nothing reads them while Mochi is off: the desktop shell closes every Mochi window and reads `/settings` only while Mochi is on, and the dashboard does not mount a disabled app's page (next row). |
| The page's own landing while Mochi is off ("Mochi is sleeping", with an **Enable Mochi** button) | the dashboard's card for a disabled installed app ("Enable this app from Apps to use it", with an **Apps** button) | The dashboard mounts an installed app's page only while the app is on (`AppHost`), as for every former built-in it adopted. The page's own landing is still here and shows while Mochi is starting. |
| `"mcpServers": {"mochi": {"command": "kirocrew", "args": ["app", "mcp", "mochi"]}}` | `"command": "python3", "args": ["backend/mcp_launch.py"]` | The gateway resolves a bare `python3` to its own interpreter and a `.py` operand inside the app to its absolute path. The launcher registers the app root as a package under a private name (and drops its own directory from `sys.path` first) so the server's relative imports resolve. This is the only shape adoption carries a stdio server in, within the wheel copy's declaration (same name, no env, no auto-approve, not disabled). |
| The server as Kiro Crew's own code, launched with the session's identity element and its managed tool policy | an installed app's server, spawned, sandboxed and gated by the gateway like any other | `serves_managed_tools` keeps the managed policy for Kiro Crew's own servers only; an installed app's tools are gated where the session is (the agent's `tools` and the PreToolUse gate, whose own-server grant follows an adopted record). |
| Absolute self-imports `kiro_crew.apps.builtins.mochi.*` | Relative imports | Hook files load into a synthetic package named after the app (App Kit `manifest-reference.md`, "Importing your own modules"). |
| Host modules imported by name (`kiro_crew.atomic_write`, `platform_compat`, `security`, ...) | the same names through `_host.py` | See "Gaps" below. A missing name refuses the operation that needs it; it never falls back to another way of doing it. |
| The page, `/mochi`, compiled into the dashboard | `ui/dist/index.mjs` at `/apps/mochi` | An external app's page is an ES module the dashboard imports. Kiro Crew's adoption pin carries the built-in's legacy route and glyph, so an existing user keeps the sidebar entry, its place and `/mochi`. |
| `fetch(path, {credentials: 'same-origin'})` to the app's routes (`api.ts`) | `appFetch`, the host's scoped client (`useAppApi().raw`) with `fetch`'s shape (`ui/src/host/appFetch.ts`) | The App Kit way to reach the app's own routes; a scoped refusal is turned back into the response it was, so every call site reads as before. |
| `toApiError` from the dashboard's API client | `ui/src/host/apiError.ts` | The same status, body and message for a gateway answer. The dashboard's copy also rewrites a tunnel edge's throttle or sign-in page into its own catalog's sentences; here such an answer reads `HTTP <status>`. |
| `i18nT` and the dashboard's catalogs | `ui/src/host/i18n.ts` and `ui/i18n/<locale>.json` (the same keys) | A bundle cannot read the dashboard's catalogs. The lookup follows the dashboard's rules (base language, then English; plurals; `{{productName}}`; values inserted literally). `tests/catalogs.test.ts` pins that every key a source file names is there. |
| Dashboard components (`Badge`, `Btn`, `Card`, `CardTitle`, `EmptyState`, `PageHeader`, `StatCard`, `Clickable`, `ErrorNotice`) | the host's own, from `@kirocrew/app-sdk/ui` | The SDK exports them. |
| `SimpleSelect` with an action row ("New category…") for the watch form's category picker | the host's `Select` (or a native one), with "New category…" as its last option | The SDK's select takes options only. Choosing it opens the same extra field; a category the server has not echoed yet stays in the list. |
| `fmtDateFields`, `fmtPercent` from the dashboard's formatters | `ui/src/host/format.ts`, the dashboard's behaviour | The SDK exports `fmtNumber` and `fmtDate` but not these two. |
| `i18next.language` in `statsFormatters.ts` | the host's active locale (`activeLocale`) | The same value, read through the SDK. |
| `"iconUrl"`, `"heroImage"`, `"screenshots"` under `/app-assets/mochi/` | `iconPath`, `heroImage`, `screenshots` under `assets/` | An external app ships its own art; the files are the built-in's. |
| Listing copy in the dashboard's catalogs (`apps.mochi.manifest`) | `l10n` in `app.json` for the 11 non-English locales | The listing copy travels with the app. |
| No `"license"` | `"license": "Apache-2.0"` | The built-in's code shipped under Kiro Crew's Apache-2.0 licence, which is this repository's `LICENSE`. Adoption does not compare it. |

One difference from the gateway's handling of a built-in: turning the app off
unloads its modules, so turning it on again within the same gateway run builds a
fresh owner loop, where the built-in restarted the same instance. The queue, the
watch list, the stats and every setting are on disk and are kept.

## The desktop windows

This app declares **no `desktop` block**, on purpose. Mochi's pet, chat panel,
Settings, Avatars and snip windows, and its three global shortcuts, are drawn by
the desktop shell's own Mochi code (`website/electron/mochi/` in Kiro Crew), from
the window pages Kiro Crew still ships at `/app-windows/mochi/{pet,panel,settings,avatar,snip}.html`.
That code finds Mochi by its record's name and `enabled` flag, so it draws exactly
what it draws today over this app's routes, which are the built-in's.

A `desktop` block is not safe yet. A newer gateway can meet an older desktop app:
the desktop app's own bundled gateway is never newer than it, but one installed
separately, run as a service or reached over a tunnel updates on its own. Before
releasing this version, every desktop shell a user can have was loaded in Node
(its real `mochi/index.js` reconcile and, where it has one, its real window host,
with Electron stubbed) and fed the `/api/apps` row an adopted Mochi sends:

| Desktop app | Record with no `desktop` block (this release) | Record that declares `desktop` windows |
|---|---|---|
| 0.12.0 to 0.12.2 (no window host) | the built-in pet, panel and three shortcuts | the same |
| 0.13.0-rc.1 | the built-in pet, panel and shortcuts; the host hosts nothing | the host refuses `displays` and `gutter`, so the same; a block without them makes the host open a second pet beside the built-in one |
| 0.13.0-rc.2, rc.3, the `release/0.13.0` line | the built-in pet, panel and shortcuts; the host hosts nothing | TWO pets: the host's and the built-in's (the built-in reads only `enabled`) |
| Kiro Crew `main` with kirodotdev/KiroCrew#37454 | the built-in pet, panel and shortcuts; the host hosts nothing | the host's pet only, and NO global shortcuts: the built-in stands down but keeps its chords reserved as a plain shell owner, so the host refuses them to this app |

With the app off, no desktop app draws anything in either column.

What a later release that moves the windows here needs:

1. A desktop release that every supported desktop app has: the built-in's code
   stands down for a record that declares `desktop` (#37454) only from Kiro Crew's
   first release that carries it, and the 0.13.0 release candidates do not.
2. Mochi's shortcut reservation handed over to the app (`{ app: true }` in
   `website/electron/mochi/shortcuts.js`, app-kit-platform §35, "One hand-over"),
   so the host may bind `toggle-window`, `hide-all` and `screen-capture` for this
   app once the built-in stands down; until then a hosted Mochi has no shortcuts.
3. The five windows on the window seam. `desktop.windows` takes at most four, so
   two of the built-in's windows (Settings and Avatars are both centred panels)
   become one, or the seam takes a fifth. The pet is an overlay on every display
   (`displays: "all"`), the chat panel a transparent panel beside it, and the
   snip surface the screen capture capability (`screenCapture`); the gateway
   choice and the reveal-file and open-image calls are the `gatewayChoice` and
   `localFiles` capabilities this manifest already declares (and the owner has
   already approved with the built-in).
4. `minAppSdkLevel` 8 on the pin, for `platformAccelerators` (the per-platform
   defaults `CommandOrControl+Shift+M/H/X` on macOS, `Alt+Shift+M/H/X` elsewhere),
   and level 7 for `displays` and `gutter` (App Kit §35, "Levelling";
   `scripts/adoption_pin.py` does not read `desktop.windows`, so the level is set
   by hand).

Until then, deleting the window pages or the shell code from Kiro Crew leaves
every desktop app with no pet.

## Gaps (what blocks deleting the wheel copy, not adopting it)

Host modules this app reaches through `_host.py`, by name, because no App Kit
seam offers them yet:

| Host name | Used at | What for | Without it | Seam that would replace it |
|---|---|---|---|---|
| `kiro_crew.atomic_write.atomic_write`, `replace_with_retry` | `activity_budget.py`, `activity_log.py`, `agent_policy.py`, `appearance_store.py`, `backend/routes.py`, `mcp_server.py`, `pinned_files_service.py`, `queue_file.py`, `settings.py`, `soul_loader.py`, `stats_service.py`, `watchlist_file.py` | the gateway's Windows-aware atomic replace | every write of the app's files refuses | a public file helper in the SDK |
| `kiro_crew.owner_only_files.restrict_file_to_owner_soft`, `OWNER_ONLY_FILE_MODE` | `activity_log.py`, `queue_file.py` | owner-only mode on the activity log and the queue | the write refuses (the mode falls back to the literal `0o600`) | the same |
| `kiro_crew.platform_compat.file_lock`, `open_create_or_existing` | `activity_log.py`, `pinned_files_service.py`, `queue_file.py`, `settings.py`, `watchlist_file.py` | the cross-process lock the owner loop and the MCP server share | every locked read-modify-write refuses | none: App Kit names `platform_compat` as the module apps route platform decisions through |
| `kiro_crew.security.redact`, `is_sensitive_path`, `sensitive_path_refusal`, `is_unverifiable_path_refusal` | `activity_log.py`, `redact.py`, `pinned_files_service.py`, `mcp_server.py` | redact agent-authored data at every browser sink; refuse pinning a sensitive path | every redaction and every pin refuses | `ctx.scrub` covers the hooks; the MCP server and the owner loop's threads need it outside a request, and a sensitive-path predicate on the context |
| `kiro_crew.mcp_discovery` (`list_servers`, `probe_server`), `kiro_crew.mcp_utils.mcp_server_alias` | `agent_policy.py`, `backend/routes.py` | list and probe the user's MCP servers for Settings > MCP and the reach policy | no MCP listing and no policy (the agent does not start) | an MCP-listing seam |
| `kiro_crew.apps.bridges.refresh_app_agents`, `get_app_manifest`, `app_skills_dir` | `agent_policy.py`, `soul_loader.py` | re-materialize the app's agents after the reach policy changes; read a bundled skill | no policy reaches the agents (the agent does not start) | an agent-spec refresh seam for an app's own agents |
| `kiro_crew.apps.manager.is_app_enabled`, `app_data_dir` | `backend/routes.py`, `mcp_server.py` | the built-in's own enabled check; the stdio MCP server's data root (it has no context) | the enabled-gated routes refuse; the MCP server has no data root | the data directory as an environment variable for an app's own child processes |
| `kiro_crew.mcp_shared.run_mcp_stdio_loop`, `call_tool_with_logging`; `kiro_crew.validation` (`validate_mcp_tool_arguments`, `coerce_mcp_tool_args_json_schema`, `ValidationError`) | `mcp_server.py` | the stdio loop, the SEL audit of every tool call, the schema check | no MCP server | an MCP-server SDK for apps |
| `kiro_crew.hooks.safe_read_file`, `safe_read_file_bytes`, `FileTooLargeError` | `backend/routes.py`, `petdex_import.py` | size-capped, link-refusing reads of the app's own files | those reads refuse | a public file helper in the SDK |
| `kiro_crew.messaging.raster.sniff_raster_mime`, `SNIFF_BYTES` | `petdex_import.py` | the shared raster sniffer for imported pack images | every PetDex import refuses | the same |
| `kiro_crew.user_json.loads_user_json`, `kiro_crew.constants.WINDOWS_DEVICE_STEMS`, `kiro_crew.apps.spawn_sdk.SpawnError` | `agent_policy.py`, `backend/routes.py`, `windows_names.py`, `queue_poller.py` | the host's JSON reader, a platform fact, the spawn capability's error | refuse; the constant falls back to the host's literal and the error class to a stand-in | none needed: pure |

Also a gap: the five desktop windows and their shell code (see "The desktop
windows" above).

## Tests

| Built-in | Here | Notes |
|---|---|---|
| `src/kiro_crew/apps/builtins/mochi/tests/test_*.py`, Kiro Crew's `test/test_mochi_*.py` | `tests/test_*.py` | Imports changed; Kiro Crew is a pinned test dependency (`tests/requirements.txt`), so the suites exercise the real host modules as they did. Direct handler calls run with the app context a registry dispatch carries (`tests/conftest.py`); a suite that registered the built-in's routes on an aiohttp application mounts the route records the way the registry serves them (`tests/routes_harness.py`). The source scans read this tree. `TestLifecycleHookResolution` (the built-in's dotted hook resolution) became `tests/test_hook_loading.py`, which drives the gateway's own loader and dispatcher over an installed copy. `test_mochi_owner_gate.py` checks the same 403 `owner_only` through `ctx.require_owner`. |
| (none) | `tests/test_manifest_contract.py`, `tests/test_routes_table.py`, `tests/test_mcp_launch.py`, `tests/test_no_host_imports.py` | The manifest held to the built-in's, no `desktop` block, the committed bundle's imports; the route table; the manifest's MCP launch started as the gateway starts it, answering from the app's data directory; only `_host.py` reaches Kiro Crew. |
| `website/src/test/MochiPageCoverage.test.tsx` and the page-module tests under `website/src/apps/mochi/` | `ui/tests/` | Run under happy-dom with the polyfills Kiro Crew's suite installs. The category picker's tests choose "New category…" from the host's select. The window tests stay in Kiro Crew with the windows. |
| (none) | `ui/tests/catalogs.test.ts` | Every key a source file names is in the bundled English catalog. |
