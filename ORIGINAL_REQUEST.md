# Original User Request

## 2026-09-02T15:29:46Z

# Teamwork Project Prompt

> Requested team: Full agent team

Decompose the 88 missing PRD features documented in `docs/discovery/missing-features.md` into dependency-ordered architectural phases, and implement all 88 features end-to-end with verified source implementations, passing automated test suites, and zero regressions.

Working directory: C:\herness
Integrity mode: benchmark

Reference material:
- Gap Catalog: `docs/discovery/missing-features.md` (Section 5: 88 missing features across 12 clusters)
- PRD Specifications: `ANANTHAM PROJECT SOURCES/prd/` (Parts 1, 2, 3)
- Existing Test Baseline: `tests/` (405 test files, 100% passing)

## Requirements

### R1. Multi-Phase Architectural Decomposition
Decompose all 88 missing features across the 12 architectural clusters into an ordered series of cohesive development phases based on dependency topological order (e.g. Core Durability & Storage -> Code Intelligence -> Execution & Multimodal -> CLI/TUI & Connectors -> Evaluation & Benchmarks).

### R2. Phase-by-Phase End-to-End Implementation
Implement each phase sequentially, developing the necessary domain entities, services, persistence layers, adapters, and interfaces in `src/` to fully realize the functionality specified in PRD Parts 1, 2, and 3 for every missing feature.

### R3. Comprehensive Automated Test Coverage
Author and run comprehensive automated unit and integration tests under `tests/` for all 88 newly implemented features matching the recommended test file targets specified in `docs/discovery/missing-features.md`.

### R4. Regression Prevention and Type Safety
Guarantee that all newly added code and existing codebase pass typechecking without TypeScript compiler errors, and that all pre-existing test suites continue to pass without failure.

## Acceptance Criteria

### Feature Implementation & Coverage
- [ ] All 88 missing features across the 12 clusters from `docs/discovery/missing-features.md` have concrete implementations in `src/`.
- [ ] Dedicated automated test files exist in `tests/` for every one of the 88 features.
- [ ] Every newly created test suite executes and passes completely.

### System Verification & Integrity
- [ ] `npm run typecheck` exits with code 0 and zero TypeScript errors.
- [ ] `npm test` executes the complete test suite (existing 405 test suites + all new test suites) with 100% pass rate.
- [ ] An updated gap report or delivery report confirms 0 remaining unaddressed PRD gaps out of the 88 targeted features.

## 2026-09-03T13:35:00Z

This is a single self-contained fix; keep it small and focused. Fix the Anantham V2 TUI interactive input handling: eliminate premature termination on arrow keys caused by raw escape sequence misinterpretation, eliminate raw Zod error dumps on empty slash commands, implement command history, and provide clear mode indicators (`[NORMAL MODE]` vs `[COMMAND MODE]`).

Working directory: C:\herness
Integrity mode: benchmark

## Requirements

### R1. Robust ANSI Escape Sequence & Arrow Key Handling
In `src/tui/tui-application.ts` and `src/tui/tui-controller.ts`, buffer and decode full ANSI escape sequences (e.g. `\x1b[A` for Up, `\x1b[B` for Down, `\x1b[C` for Right, `\x1b[D` for Left) so arrow keys do not prematurely trigger ESC-quit termination. In command mode, Up/Down arrow keys must navigate command history. In normal mode, arrow keys must not terminate the application.

### R2. Graceful Command Parsing & Error Formatting
In `src/cli/command-parser.ts`, handle empty, whitespace-only, and bare slash (`/` or `:`) inputs gracefully without throwing uncaught Zod validation errors (`path: ['name'], message: 'String must contain at least 1 character(s)'`). When any command fails, format errors as clean, single-line human-readable messages rather than raw multi-line Zod JSON objects.

### R3. Interactive Mode Indicators & UX Polish
Support both `:` and `/` to enter command mode from normal mode. Render a distinct status bar indicator showing whether the TUI is in `[NORMAL MODE]` (showing navigation keys `[1-9] Views, [:] Command, [q] Quit`) or `[COMMAND MODE]` (showing the active command prompt, `[ENTER] Run, [ESC] Cancel`), eliminating ambiguity and preventing accidental view changes when typing.

## Acceptance Criteria

### Input & Stability
- [ ] Pressing Up, Down, Left, or Right arrow keys anywhere in the TUI does not terminate the process.
- [ ] In command mode, pressing Up Arrow recalls previously executed slash commands from history.
- [ ] Pressing Enter on an empty command line or bare `/` cancels or clears without displaying a Zod validation error dump.
- [ ] Pressing `:` or `/` enters command mode, and ESC exits back to normal navigation mode without quitting the TUI.
- [ ] Errors from invalid commands are rendered as concise human-readable error messages, not raw Zod JSON objects.

### Verification
- [ ] Dedicated automated vitest unit tests in `tests/tui/tui-input-ux.test.ts` pass 100%.
- [ ] `npm run typecheck` passes with zero errors under `strict: true`.

## 2026-09-05T13:43:07Z

This is a single self-contained fix; keep it small and focused. Implement OpenCode-parity API key management, model selection, full-screen alternate buffer rendering, and interactive command output display in Anantham V2 TUI.

Working directory: C:\herness
Integrity mode: benchmark

## Gap Analysis (OpenCode vs Anantham)

1. **Terminal Rendering Architecture**:
   - *OpenCode*: Uses ANSI Alternate Screen Buffer (`\x1b[?1049h` on start, `\x1b[?1049l` on exit) with clean in-place cursor repositioning (`\x1b[H`). Keypresses update the screen in-place with zero scrollback leakage.
   - *Anantham (Before)*: Emits `\x1b[2J\x1b[H` without alternate screen buffer into standard stdout with a trailing newline, causing Windows PowerShell to append the entire 24-line screen repeatedly every time a key or view number is pressed.

2. **Command Output & Execution Visibility**:
   - *OpenCode*: Every slash command (`/help`, `/key`, `/model`, `/session`, etc.) renders an interactive modal, output box, or notification banner showing the command result, tables, and formatted responses.
   - *Anantham (Before)*: `TuiController.executeCommand` received `result.message` from `CommandRegistry` but completely discarded it if `result.success === true`. Only errors were shown, making commands like `/help`, `/key list`, and `/model` appear completely broken to the user.

3. **API Key Connection & Persistence**:
   - *OpenCode*: Stores credentials persistently in `~/.opencode/config.json` and project `.env`, supports OpenRouter, Anthropic, OpenAI, Gemini, Groq, DeepSeek, and Ollama, and auto-detects configured providers.
   - *Anantham (Before)*: `/key set` only set in-memory `process.env`, losing keys upon terminal restart, and lacked persistence to user home directory configuration (`~/.anantham/config.json`).

4. **Model Selection & Discovery**:
   - *OpenCode*: Provides `/model` and `/models` command to browse, list, and switch between models grouped by provider, with validation of API keys.
   - *Anantham (Before)*: Minimal string assignment without provider listing, preset suggestions, or active provider verification.

## Requirements

### R1. True In-Place Full-Screen TUI (ANSI Alternate Buffer)
In `src/tui/tui-application.ts` and `src/tui/tui-controller.ts`, initialize the ANSI Alternate Screen Buffer (`\x1b[?1049h\x1b[?25l\x1b[H`) on TUI start and restore normal buffer (`\x1b[?1049l\x1b[?25h`) on shutdown. Reposition the cursor at `1,1` on every render frame without appending trailing newlines into scrollback. Switching views (`1`-`9`) must update strictly in-place with zero duplicate screen dumps.

### R2. Interactive Command Output Display & Modals
In `src/tui/tui-controller.ts` and `src/tui/tui-renderer.ts`, capture and display successful command execution results (`result.message` and `result.data`) in a dedicated command output panel or overlay box. Running `/help` must render the complete command manual; running `/key list` must display the provider keys table; running `/model` must display the active model and preset options. Add an explicit `[c] Clear Output` or auto-dismiss on view change.

### R3. OpenCode-Parity Persistent Key Management (`/key` and `/connect`)
In `src/cli/command-registry.ts` and a dedicated user configuration manager (`src/persistence/user-config-manager.ts`):
- Persist API keys to `~/.anantham/config.json` and sync with `.env` and `process.env`.
- Support `/key set <provider> <key>` and `/connect <provider> [key]` for: OpenRouter, OpenAI, Anthropic, Gemini, Groq, DeepSeek, and Ollama.
- Support `/key remove <provider>`.
- Auto-load `~/.anantham/config.json` on CLI and TUI boot so keys persist permanently across restarts.

### R4. OpenCode-Parity Model Selection (`/model` and `/models`)
In `src/cli/command-registry.ts`:
- Support `/model [modelId]` to switch the active model (e.g. `openrouter/anthropic/claude-3.5-sonnet`, `gemini-2.5-pro`, `gpt-4o`, `deepseek-r1`).
- Support `/models [provider]` to list available curated models, categorized by provider.
- Persist default model preference in `~/.anantham/config.json` and the active project entity.

## Acceptance Criteria

### Terminal Rendering & Navigation
- [ ] Pressing `1` through `9` switches views in-place without appending duplicate screens to terminal history.
- [ ] On exit (`q` or `exit`), the terminal cleanly restores the primary screen buffer and cursor.

### Command Execution & Display
- [ ] Running `/help` in the TUI renders the complete list of available slash commands and usage.
- [ ] Running `/key list` displays all configured providers and masked keys.
- [ ] Running `/key set openrouter sk-or-...` connects the key, persists it to `~/.anantham/config.json`, and displays an immediate success banner.
- [ ] Running `/model` displays the current active model and curated options.
- [ ] Running `/models` lists supported models across OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, and Groq.

### Verification
- [ ] Automated tests in `tests/tui/tui-screen-and-commands.test.ts` and `tests/persistence/user-config-manager.test.ts` pass 100%.
- [ ] `npm run typecheck` passes with 0 errors under `strict: true`.

## Follow-up — 2026-09-05T19:54:21Z

Build a high-performance, reactive Terminal User Interface (TUI) agent harness integrated natively into Anantham V2 (`C:\herness`) inspired by the "Antigravity" design language (dark onyx background `#0A0A0C`, neon cyan-to-violet borders, floating glow command dock) with live OpenRouter provider-grouped model browsing, custom logo rendering via terminal graphics and TrueColor half-blocks, unified model commands, and context-aware Escape exit handling.

Working directory: C:\herness
Integrity mode: benchmark

## Requirements

### R1. OpenRouter Live Catalog & Interactive Accordion Model Browser
Connect via OpenRouter API key (`OPENROUTER_API_KEY` / `~/.anantham/config.json`), fetch the live catalog from `https://openrouter.ai/api/v1/models` with 1-hour local caching (`~/.anantham/models_cache.json`), and parse model IDs into an interactive provider-grouped accordion tree view (Anthropic, OpenAI, Google, DeepSeek, Meta/Llama, Virtuals). Support expanding/collapsing with Space/Arrow keys, search filtering, and setting the active model with Enter.

### R2. Unified Model Command Architecture
Consolidate all model commands into a unified `/models` command (aliased to `/model`). Running `/models` opens the interactive provider explorer directly with zero command conflicts or duplicate view blocks.

### R3. Context-Aware Global `Escape` Key Handling
Enforce two-tier `Escape` key handling:
- Inside modals/sub-menus/palette: `Esc` closes the modal and returns focus to the root command bar.
- At root command bar: `Esc` immediately restores the alternate screen buffer (`\x1b[?1049l`), unhides the cursor (`\x1b[?25h`), removes raw keyboard listeners, and terminates cleanly (`exit 0`).

### R4. Custom Logo Rendering Engine (Kitty / Sixel / ANSI Half-Block)
Support custom image logo ingestion via `--logo <path>`, config entry, or `./assets/logo.png`. Probe terminal capabilities for Kitty Graphics protocol, Sixel, or iTerm2 inline image protocol to render graphics directly in the header. If unsupported, automatically fall back to 24-bit TrueColor half-blocks (`▀`, `▄`, `█`) styled in the Antigravity palette.

### R5. Token Telemetry & Usage Analytics (`/usage`)
Maintain real-time rolling daily and month-to-date token and cost telemetry, budget limits, top-model rankings, and 7-day sparklines, logging persistently to `~/.anantham/token_metrics.json`.

## Acceptance Criteria

### Interactive OpenRouter Explorer
- [ ] Authorized `GET` request to `https://openrouter.ai/api/v1/models` with 1-hour local disk cache in `~/.anantham/models_cache.json`.
- [ ] Interactive accordion tree view groups models by provider prefix (`openai/*`, `anthropic/*`, `google/*`, `deepseek/*`, `meta-llama/*`) displaying context window, pricing, and active status.
- [ ] Keyboard navigation: `↑`/`↓` moves selection across providers/models, `Space` or `→` expands/collapses provider folder, `Enter` selects active model.

### Unified Command & Global Escape Semantics
- [ ] `/models` and `/model` route to the identical unified provider explorer modal without duplicate view dumps.
- [ ] Pressing `Esc` inside any open modal/palette closes the modal and restores focus to the main input line.
- [ ] Pressing `Esc` from the root prompt immediately resets the terminal buffer (`\x1b[?1049l`), restores the cursor (`\x1b[?25h`), removes stdin listeners, and exits cleanly with exit code 0.

### Custom Logo Rendering Pipeline
- [ ] Ingests logo from `--logo <path>`, config `logo_path`, or fallback `./assets/logo.png`.
- [ ] Probes terminal for Kitty, Sixel, or iTerm2 protocols, rendering graphic file if supported.
- [ ] Gracefully falls back to 24-bit TrueColor half-blocks (`▀`, `▄`, `█`) rendered in the left header pane without distortion.

### Token Telemetry
- [ ] `/usage` renders full-width ANSI TrueColor horizontal gradient dashboard with Today, MTD, Budget, model volume leaderboard, and rolling 7-day sparklines.
- [ ] Telemetry logs atomically to `~/.anantham/token_metrics.json`.

### Verification Targets
- [ ] `npm run typecheck` passes with 0 errors under `strict: true`.
- [ ] `npm run build` succeeds without compiler warnings.
- [ ] Automated Vitest test suites in `tests/tui/` pass 100%.
- [ ] Headless CLI execution `anantham --version`, `anantham -e "/models"`, and `anantham -e "/usage"` execute cleanly.

