import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

interface WebSocketMessage {
	type: string;
	html?: string;
	title?: string;
	fullPath?: string;
	relPath?: string;
}

export interface ConnectionStatus {
	icon: string;
	message: string;
	offline: boolean;
}

export function useWebSocket(onUpdate: (msg: WebSocketMessage) => void) {
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const pendingRef = useRef<string[]>([]);
	const [status, setStatus] = useState<ConnectionStatus>({
		icon: '\uD83D\uDD0C',
		message: 'Connected, live preview active\u2026',
		offline: false,
	});

	useEffect(() => {
		const id = window.__ONAIR__?.id;
		if (!id) return;

		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		let ws: WebSocket | null = null;

		function updateStatus(icon: string, msg: string, offline: boolean) {
			setStatus({ icon, message: msg, offline });
		}

		function connect() {
			ws = new WebSocket(proto + '://' + location.host + '/ws/' + id);
			wsRef.current = ws;
			ws.onopen = () => {
				updateStatus('\uD83D\uDD0C', 'Connected, live preview active\u2026', false);
				if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
				const pending = pendingRef.current;
				pendingRef.current = [];
				for (const msg of pending) {
					if (ws.readyState === WebSocket.OPEN) { ws.send(msg); }
				}
			};
			ws.onmessage = (ev) => {
				try {
					const msg: WebSocketMessage = JSON.parse(ev.data);
					if (msg.type === 'update') {
						onUpdate(msg);
					} else if (msg.type === 'filetree-changed') {
						window.dispatchEvent(new CustomEvent('onair:tree-refresh'));
					} else if (msg.type === 'closed') {
						updateStatus('\u26A0\uFE0F', 'Source file was closed in VS Code, preview will no longer update', true);
					}
				} catch { /* ignore malformed message */ }
			};
			ws.onclose = () => {
				wsRef.current = null;
				updateStatus('\u26A0\uFE0F', 'Connection lost, reconnecting\u2026', true);
				reconnectTimer.current = setTimeout(connect, 1500);
			};
		}

		connect();

		return () => {
			if (ws) ws.close();
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
		};
	}, [onUpdate]);

	const send = useCallback((msg: object) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		} else {
			pendingRef.current.push(JSON.stringify(msg));
		}
	}, []);

	return { status, send };
}
