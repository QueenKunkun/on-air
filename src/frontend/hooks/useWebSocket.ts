import { useEffect, useRef } from 'preact/hooks';

interface WebSocketMessage {
	type: string;
	html?: string;
	title?: string;
	fullPath?: string;
	relPath?: string;
}

export function useWebSocket(onUpdate: (msg: WebSocketMessage) => void) {
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const id = window.__ONAIR__?.id;
		if (!id) return;

		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		let ws: WebSocket | null = null;

		const bannerIcon = document.getElementById('bannerIcon');
		const bannerMsg = document.getElementById('bannerMsg');
		const bannerTxt = document.getElementById('bannerTxt');
		const bannerEl = document.getElementById('banner');

		function setStatus(icon: string, msg: string, offline: boolean) {
			if (bannerIcon) bannerIcon.textContent = icon;
			if (bannerMsg) bannerMsg.textContent = msg;
			if (bannerTxt) bannerTxt.title = msg;
			bannerEl?.classList.toggle('offline', offline);
		}

		function connect() {
			ws = new WebSocket(proto + '://' + location.host + '/ws/' + id);
			ws.onopen = () => {
				setStatus('\uD83D\uDD0C', 'Connected, live preview active\u2026', false);
				if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
			};
			ws.onmessage = (ev) => {
				try {
					const msg: WebSocketMessage = JSON.parse(ev.data);
					if (msg.type === 'update') {
						onUpdate(msg);
					} else if (msg.type === 'filetree-changed') {
						window.dispatchEvent(new CustomEvent('onair:tree-refresh'));
					} else if (msg.type === 'closed') {
						setStatus('\u26A0\uFE0F', 'Source file was closed in VS Code, preview will no longer update', true);
					}
				} catch { /* ignore malformed message */ }
			};
			ws.onclose = () => {
				setStatus('\u26A0\uFE0F', 'Connection lost, reconnecting\u2026', true);
				reconnectTimer.current = setTimeout(connect, 1500);
			};
		}

		connect();

		return () => {
			if (ws) ws.close();
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
		};
	}, [onUpdate]);
}
