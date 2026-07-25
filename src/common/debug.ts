/**
 * Debug logging utility for on-air extension.
 *
 * Enable by setting the environment variable ONAIR_DEBUG=1
 * or by calling `setDebugEnabled(true)` at runtime.
 *
 * Usage:
 *   import { debug } from '../common/debug';
 *   debug('register:', file, rootDir);
 */
let _enabled = false;

export function setDebugEnabled(v: boolean) { _enabled = v; }
export function isDebugEnabled() { return _enabled; }

export function debug(...args: unknown[]) {
	if (_enabled) console.log('[on-air]', ...args);
}

export function debugWarn(...args: unknown[]) {
	if (_enabled) console.warn('[on-air]', ...args);
}
