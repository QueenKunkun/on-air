# OnAir

Turn the currently open Markdown or HTML file into a **live local preview link**: open it in a browser, or copy the link and share it with a colleague or another device. The browser content refreshes automatically as you edit — no need to manually refresh, and no need to save the file first.

## Features

- **Markdown & HTML** — generate a link from the Command Palette, right-click menu, or title bar icon, then **open in browser** or **copy the link**
- **Stable links** — the same file always gets the same address; multiple files can preview at once
- **Live sync** — edits refresh automatically (no save needed); Markdown updates in place, HTML reloads
- **Table of contents** — nested navigation, scroll tracking, resizable, collapsible; plus a **Related documents** list, and relative links to other docs open as previews
- **Assets just work** — sibling files (`images/`, `embeds/`, …) and relative references are served automatically
- **Reading comfort** — code highlighting with a wrap toggle, font size and scrollbar width controls, and auto/dark/light themes
- **LAN sharing** — get a localhost and a LAN IP link so others on your WiFi can open the preview


## Usage

1. Open a `.md` or `.html` file
2. Open the Command Palette with `Cmd+Shift+P` and run `OnAir: Generate Live Preview Link` (or click the globe icon in the top-right of the editor)
3. Choose **Open in Browser** to launch it directly, or **Copy Link to Clipboard** to paste it elsewhere
4. Keep editing — the browser content updates automatically

## How it works / Notes

- When activated, the extension starts a local HTTP + WebSocket server, searching for an available port starting from `5757`
- Links look like `http://127.0.0.1:<port>/preview/<id>` and **can only be opened in a browser on this machine** — they are not public addresses. To share with someone else, you'd need to be on the same local network and replace `127.0.0.1` with your LAN IP, or set up your own tunnel (e.g. ngrok)
- The local server stops when VS Code closes, so links naturally expire
- Static assets are only resolved relative to the previewed file's own directory (no escaping via `../` outside of it), and standard Markdown link rules apply: a path containing spaces or non-ASCII characters needs to be either percent-encoded (`images/%E5%9B%BE.png`) or wrapped in angle brackets (`![alt](<images/图.png>)`) — otherwise Markdown won't parse it as a link at all

## TODO (optional future improvements)

## Install (from market)

1. Download from [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=KristinZhang.on-air ) or
2. Download from [openvsx](https://open-vsx.org/extension/KristinZhang/on-air )

## Install (from source)

```bash
pnpm install
pnpm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host, or package with `vsce package`.

