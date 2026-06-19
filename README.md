# OnAir

Turn the currently open Markdown or HTML file into a **live local preview link**: open it in a browser, or copy the link and share it with a colleague or another device. The browser content refreshes automatically as you edit — no need to manually refresh, and no need to save the file first.

## Features

- Supports both **Markdown** and **HTML** files
- Run "OnAir: Generate Live Preview Link" from the Command Palette, right-click menu, or the editor title bar icon
- A picker lets you choose **Open in Browser** or **Copy Link to Clipboard**, so you decide how to use the link
- The link is stable: generating it again for the same file gives you the same address
- Live sync: editing in VS Code (no need to save) triggers an automatic refresh; Markdown updates in place (no flash), while HTML does a full page reload since it's a complete page with its own styles/scripts
- Markdown code blocks get syntax highlighting (highlight.js)
- Multiple files can each have their own preview link running at the same time, independently
- When a file is closed, the browser shows a "source file closed, preview will no longer update" notice

## Usage

1. Open a `.md` or `.html` file
2. Open the Command Palette with `Cmd+Shift+P` and run `OnAir: Generate Live Preview Link` (or click the globe icon in the top-right of the editor)
3. Choose **Open in Browser** to launch it directly, or **Copy Link to Clipboard** to paste it elsewhere
4. Keep editing — the browser content updates automatically

## How it works / Notes

- When activated, the extension starts a local HTTP + WebSocket server, searching for an available port starting from `5757`
- Links look like `http://127.0.0.1:<port>/preview/<id>` and **can only be opened in a browser on this machine** — they are not public addresses. To share with someone else, you'd need to be on the same local network and replace `127.0.0.1` with your LAN IP, or set up your own tunnel (e.g. ngrok)
- The local server stops when VS Code closes, so links naturally expire

## TODO (optional future improvements)

- [ ] Auto-detect LAN IP, to make sharing with colleagues on the same WiFi easier
