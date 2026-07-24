import { h } from 'preact';

interface ConnectionStatusProps {
	icon: string;
	message: string;
	offline: boolean;
}

export function ConnectionStatus({ icon, message, offline }: ConnectionStatusProps) {
	return (
		<span id="bannerTxt" title={message}>
			<span id="bannerIcon">{icon}</span>
			<span class="banner-msg">{message}</span>
		</span>
	);
}
