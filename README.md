# OnAir

Turn the currently open Markdown, HTML, or image file into a **live local preview link**: open it in a browser, or copy the link and share it with a colleague or another device. The browser content refreshes automatically as you edit — no need to manually refresh, and no need to save the file first.

## Features

- **Markdown, HTML & images** — generate a link from the Command Palette, right-click menu, or title bar icon, then **open in browser** or **copy the link**; image files (png/jpg/gif/webp/svg/bmp/ico) open as a live preview
- **Stable links** — the same file always gets the same address; multiple files can preview at once
- **Live sync** — edits refresh automatically (no save needed); Markdown updates in place, HTML reloads
- **Math formulas** — `$..$` and `$$..$$` LaTeX rendered with KaTeX
- **Table of contents** — nested navigation, scroll tracking, resizable, collapsible; shows the file's relative path; plus a **Related documents** list, and relative links to other docs open as previews
- **File tree** — project file tree with search (`*.svg`), filter (`.md`, `.gitignore`, unsupported files), expand-to-current-file, and state persistence
- **Multi-theme** — 16 preset themes
- **Highlights & footnotes** — `==highlight==` text with notes shown as margin cards, and footnotes rendered in a collapsible block
- **Assets just work** — sibling files (`images/`, `embeds/`, …) and relative references are served automatically
- **Reading comfort** — code highlighting with a wrap toggle, font size and scrollbar/content width controls
- **Cross-references** — `.md` filename links to a path-proximity picker
- **LAN sharing** — get a localhost and a LAN IP link so others on your WiFi can open the preview


## Usage

1. Open a `.md`, `.html`, or image file
2. Open the Command Palette with `Cmd+Shift+P` and run `OnAir: Generate Live Preview Link` (or click the globe icon in the top-right of the editor)
3. Choose **Open in Browser** or **Copy Link** (the menu also offers **(LAN)** variants when a local network is detected)
4. Keep editing — the browser content updates automatically

## How it works / Notes

- A local HTTP + WebSocket server starts on the first free port from `6868`; links look like `http://127.0.0.1:<port>/preview/<id>`.
- The **(LAN)** options swap `127.0.0.1` for your machine's LAN IP so others on the same network can open the preview. These links aren't public.
- The server runs while VS Code is open and stops when it closes, so links expire then.
- Assets are served only from within the previewed file's project (its workspace folder, or its own directory otherwise), so `../` paths inside the project resolve while nothing outside is exposed.
- Markdown link paths with spaces or non-ASCII characters must be percent-encoded (`images/%E5%9B%BE.png`) or wrapped in angle brackets (`![alt](<images/图.png>)`), or Markdown won't parse them.

## Install (from market)

1. Download from [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=KristinZhang.on-air) or
2. Download from [openvsx](https://open-vsx.org/extension/KristinZhang/on-air)

## Install (from source)

```bash
pnpm install
pnpm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host, or package with `vsce package`.

