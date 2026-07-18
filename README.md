# OnAir

Turn the currently open Markdown or HTML file into a **live local preview link**: open it in a browser, or copy the link and share it with a colleague or another device. The browser content refreshes automatically as you edit — no need to manually refresh, and no need to save the file first.

## Features

- Supports both **Markdown** and **HTML** files
- Run "OnAir: Generate Live Preview Link" from the Command Palette, right-click menu, or the editor title bar icon
- A picker lets you choose **Open in Browser** or **Copy Link to Clipboard**, so you decide how to use the link
- The link is stable: generating it again for the same file gives you the same address
- Live sync: editing in VS Code (no need to save) triggers an automatic refresh; Markdown updates in place (no flash), while HTML does a full page reload since it's a complete page with its own styles/scripts
- Markdown code blocks get syntax highlighting (highlight.js); a "Wrap" toggle in the sticky banner lets you switch between horizontal scrolling and word-wrapping for long lines
- Multiple files can each have their own preview link running at the same time, independently
- When a file is closed, the browser shows a "source file closed, preview will no longer update" notice
- Local files next to the previewed document (e.g. an `images/`, `embeds/`, or `attachments/` folder) are served automatically, so relative references like `![alt](images/foo.png)` or `<iframe src="embeds/page.html">` just work
- **Table of contents** sidebar with nested heading navigation, scroll tracking, full path on hover with copy, and resizable width — works in both Markdown and HTML previews
- Relative links to other Markdown/HTML documents in your workspace open as live previews, so you can click through a project right from the preview
- A **Related documents** list under the TOC links to docs referenced by the current page; drag the divider to resize it
- **Font size controls** in the preview banner; preference remembered
- **Theme switch** — auto, dark, light mode
- **LAN sharing**: quick pick shows both localhost and LAN IP links when you're on a network, so colleagues on the same WiFi can open your preview directly


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

