const BASE = 'http://x.invalid';

/**
 * Only addresses inside the app are accepted as a place to go after signing in. Browsers read `\` as
 * `/` and drop tabs and newlines, so `/\evil.com` and `/<tab>/evil.com` would leave the site: anything
 * with a backslash or a control character is refused, and what is left must still resolve to this site.
 */
export function safeNext(value: string | null): string {
	if (!value || !value.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(value)) return '/';
	try {
		const url = new URL(value, BASE);
		return url.origin === BASE ? url.pathname + url.search + url.hash : '/';
	} catch {
		return '/';
	}
}
