# Repository Guidelines

## Project Shape

- This is the Ui.Vision RPA browser extension, built as a mixed JavaScript/TypeScript React 18 + Redux + Ant Design WebExtension.
- Webpack is the build system. Entry points are declared in `webpack.prod.config.js`; static extension templates, images, locale assets, and `manifest.json` live under `extension/`.
- Runtime source lives under `src/`. Important areas include:
  - `src/ext/` for background, content script, injected script, popup, and shared extension helpers.
  - `src/containers/` and `src/components/` for React UI.
  - `src/common/` for shared utilities, IPC, config, storage wrappers, and extension abstractions.
  - `src/services/` for feature services, including storage, OCR, native host, player, screen capture, and AI integrations.
- Build output goes to `dist/` for Chrome/Edge and `dist_ff/` for Firefox. These folders and `*_ext.zip` archives are generated artifacts.

## Commands

- Use the Node/npm versions documented in `README.md` when possible: Node `20.11.1`, npm `10.2.4`.
- Install dependencies with `npm i -f`. The force flag is part of the documented workflow for this legacy dependency set.
- Development watch builds:
  - `npm run start` for Chrome/Edge.
  - `npm run start-ff` for Firefox.
- Production builds:
  - `npm run build` for Chrome/Edge, producing `dist/` and `chrome_ext.zip`.
  - `npm run build-ff` for Firefox, producing `dist_ff/` and `firefox_ext.zip`.
- `package.json` does not currently define test or lint scripts. If you need checks, run targeted commands explicitly and mention them in the final response.

## Coding Style

- Match nearby code. The codebase generally uses ES module imports, React class components in many older UI files, no semicolons in much of `src/`, and a pragmatic mix of JS and TS.
- TypeScript is configured with `strict: true`, but many core files are still JavaScript. Add types when editing TS; avoid broad JS-to-TS conversions unless requested.
- Path aliases are configured for `@/* -> src/*` and `$/* -> repo root`. Prefer whichever import style is already used in the file you are editing.
- Keep comments sparse and useful. This codebase already has targeted comments around browser-extension behavior and timing-sensitive automation logic.

## Extension Notes

- Use `src/common/web_extension` and existing extension helpers where possible instead of calling `chrome`/`browser` APIs directly in new shared code.
- `extension/manifest.json` is the base manifest. `BrowserExtensionWebpackPlugin` mutates it for Firefox during build, including background script, sidebar, options UI, and permission differences.
- Be careful with Manifest V3 service worker constraints in background code. Avoid adding APIs or long-lived assumptions that only work in document contexts.
- Build commands may update `.webpack-records.json`. Treat `dist/`, `dist_ff/`, zip archives, and incidental build output as generated unless the user explicitly asks for release artifacts.

## Change Hygiene

- The repository may have local uncommitted work. Do not revert unrelated changes.
- Keep edits scoped to the feature or bug being worked on. Avoid formatting-only churn across old JS files.
- When touching AI provider code, check `src/common/ai_config.ts`, `src/services/ai/`, and the side panel chat UI together so config, service behavior, and UI status stay aligned.
