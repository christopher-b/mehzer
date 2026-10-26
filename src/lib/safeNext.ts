/** Only addresses inside the app are accepted as a place to go after signing in. */
export function safeNext(value: string | null): string {
	return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
