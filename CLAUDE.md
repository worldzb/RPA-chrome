# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and development commands

| Task | Command | Notes |
| --- | --- | --- |
| Install dependencies | `npm i -f` | README specifies Node `20.11.1` and npm `10.2.4`. |
| Watch build for Chrome/Edge | `npm run start` | Writes unpacked extension to `dist/`. |
| Watch build for Firefox | `npm run start-ff` | Writes unpacked extension to `dist_ff/`. |
| Production build for Chrome/Edge | `npm run build` | Creates `dist/` and `chrome_ext.zip`. |
| Production build for Firefox | `npm run build-ff` | Creates `dist_ff/` and `firefox_ext.zip`. |

## Validation commands

| Task | Command | Notes |
| --- | --- | --- |
| TypeScript config check | `npx tsc -p tsconfig.json --noEmit` | Mixed JS/TS repo; catches TS-only issues. |
| ESLint | `npx eslint src --ext .js,.jsx,.ts,.tsx` | Uses `.eslintrc.js`; there is no npm lint script. |

## Tests

There is no automated test runner configured in `package.json`, and no standard unit/integration test suite is present in this repo. There is also no “run a single test” command today.

## Output structure

| Target | Directory |
| --- | --- |
| Chrome/Edge unpacked extension | `dist/` |
| Firefox unpacked extension | `dist_ff/` |

## Architecture overview

This is a browser extension for Ui.Vision RPA with several cooperating runtimes:

| Runtime | Entry point | Responsibility |
| --- | --- | --- |
| Popup / main app | `src/index.js` | Boots React + Redux UI, restores storage-backed state, initializes the macro player, and renders either the popup app or side panel app. |
| Side panel UI | `src/sidepanel_app.js` | Alternate shell for the macro/file/log/AI workflow when running inside the browser side panel. |
| Background worker | `src/ext/bg.js` | Central coordinator for tabs, badges, recording/inspection/playback control, downloads, proxy handling, native messaging, and panel orchestration. |
| Content script | `src/ext/content_script/index.js` | Injected into all pages to execute commands against page DOM and communicate with the background worker. |
| Injected script | `src/ext/inject.js` | Runs in page context when direct page-world access is needed. |
| Vision editor | `src/vision_editor/index.tsx` | Standalone image annotation editor for visual search assets. |
| Desktop screenshot editor | `src/desktop_screenshot_editor/index.tsx` | Standalone desktop screenshot overlay/crop/OCR result viewer. |
| Options page | `src/options.ts` | Extension settings UI. |

## State and UI flow

- Redux store is created in `src/redux/index.js` with thunk, promise middleware, post-logic middleware, and a compatibility middleware for older thunk-style actions.
- Canonical state shape lives in `src/reducers/state.ts`; reducer logic is in `src/reducers/index.js`.
- High-level actions are concentrated in `src/actions/index.js`. This file is a key orchestration layer: it persists config/editing state, talks to background IPC, and bridges UI events to storage/player operations.
- The main popup app shell is `src/app.js`; the side panel shell is `src/sidepanel_app.js`.
- Most user workflow lives in container trees under `src/containers/`, especially `dashboard/`, `sidebar/`, and `sidepanel/`.

## Macro execution architecture

- `src/init_player.tsx` wires together the runtime macro player, interpreter, macro call stack, monitors, and store updates.
- `src/modules/players.tsx`, `src/modules/run_command.ts`, and `src/modules/interpret_commands.ts` are the core execution pipeline for commands.
- `src/services/player/` contains the lower-level player subsystem: call stack, macro state, timers/countdowns, and monitors.
- `src/common/player.js` exposes cached player instances used throughout the app.
- Playback state is mirrored into Redux so the UI can render progress, loops, timeout status, and logs.

## Storage model

Storage is a core architectural boundary in this codebase.

- `src/services/storage/index.ts` is the main abstraction. It switches between browser-backed storage and native XFile-backed storage.
- `StorageStrategyType.Browser` stores macros/test suites/assets in browser-managed filesystem/IndexedDB-style storage.
- `StorageStrategyType.XFile` routes the same logical resources through the native file access module and a real root directory.
- Logical storage targets are Macro, TestSuite, CSV, Screenshot, and Vision. The mapping of each target to directory/encoding rules is defined centrally in `src/services/storage/index.ts`.
- `src/services/storage/std/standard_storage.ts` defines the common tree/list/read/write/move/remove API used by both browser and native implementations.
- Extra per-macro/per-suite metadata is stored separately under `src/services/kv_data/`.
- Migration entry points live in `src/services/migration/`; currently the registered migration service is created in `src/services/migration/index.ts`.

## IPC and extension process boundaries

- `src/common/ipc/ipc_bg_cs.js` is the main message bus abstraction between background, content scripts, and side panel.
- The side panel is treated as a special IPC endpoint with a synthetic tab identifier.
- Background code in `src/ext/bg.js` is the hub; UI code and content scripts generally ask background to perform privileged browser operations.
- Timeout polyfills in `src/services/timeout/cs_timeout.ts` are used in non-standard extension contexts such as editors and panel flows.

## Native modules and desktop integration

Desktop automation depends heavily on native messaging and XModules.

- `src/services/native_host/index.ts` provides the native messaging host queue/connection abstraction.
- `src/services/xmodules/` contains wrappers for XFile, XDesktop, screen capture, local execution, and user IO.
- `src/services/xmodules/xfile.ts` initializes and validates the native root directory (defaulting to a `uivision` folder on the desktop).
- `src/services/filesystem/` and `src/services/desktop/` expose native filesystem and computer-vision helpers used by OCR, screenshots, and desktop commands.
- When debugging failures around desktop automation, check both the extension-side wrapper and the native host/XModule assumptions.

## OCR and AI integration

- OCR services are centered in `src/services/ocr/`.
- `src/services/ocr/index.ts` supports multiple OCR paths: remote OCR.space APIs, local OCR executables, and bundled Tesseract-based flows.
- AI integrations currently use Anthropic APIs. There are two parallel service locations in the repo:
  - `src/services/anthropic/`
  - `src/services/ai/anthropic/`
- Computer-use / AI-driven action execution lives under `src/services/ai/computer_use/` and `src/services/ai/computer-use/`; both naming variants exist in the tree, so verify imports before refactoring.
- The settings UI for AI keys and checks is under `src/components/settings_modal/tabs/ai.tsx`.

## Build system notes

- Webpack config is in `webpack.prod.config.js` and is used for both development watch and production builds.
- The build emits multiple entry bundles from one config: popup, sidepanel, options, background, content script, inject script, vision editor, and desktop screenshot editor.
- `build/browser_extension_webpack_plugin.js` plus logic in `webpack.prod.config.js` rewrites the manifest for browser-specific packaging.
- Firefox packaging is not a separate config; the same webpack file mutates manifest behavior when `BROWSER=firefox`.
- `extension/` contains static assets and HTML templates copied into build output. The final manifest is derived from `extension/manifest.json`, not copied verbatim.

## Important repository-specific notes

- README development instructions mention `npm run ext`, but the current `package.json` exposes `npm run start` and `npm run start-ff` instead.
- The codebase is intentionally mixed JavaScript and TypeScript; avoid assuming a single language migration is already in progress.
- Path aliases are `@` → `src` and `$` → repository root, configured in both webpack and `tsconfig.json`.
- The extension targets Manifest V3 for Chrome, with compatibility rewrites for Firefox during build.
