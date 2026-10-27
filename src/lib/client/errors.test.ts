import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionError, classifyResponse, classifyThrown, messageFor } from './errors.ts';

const ok = { status: 200 };

afterEach(() => vi.unstubAllGlobals());

describe('classifyResponse', () => {
	it('accepts success and ordinary redirects', () => {
		expect(classifyResponse(ok, { type: 'success', status: 200 })).toBeNull();
		expect(classifyResponse(ok, { type: 'redirect', status: 303, location: '/p/1' })).toBeNull();
	});

	it('treats 401 and sign-in redirects as an expired session', () => {
		expect(classifyResponse({ status: 401 }, undefined)?.kind).toBe('session');
		expect(classifyResponse({ status: 200, redirected: true, url: 'http://x/login?next=%2F' }, undefined)?.kind).toBe('session');
		expect(classifyResponse(ok, { type: 'redirect', location: '/login?next=/' })?.kind).toBe('session');
	});

	it('treats a body that is not an action result as a server problem', () => {
		expect(classifyResponse(ok, undefined)?.kind).toBe('server');
		expect(classifyResponse(ok, { type: 'weird' })?.kind).toBe('server');
	});

	it('maps error results by status and keeps the error id', () => {
		expect(classifyResponse(ok, { type: 'error', status: 401 })?.kind).toBe('session');
		expect(classifyResponse(ok, { type: 'error', status: 404 })?.kind).toBe('not-found');
		const e = classifyResponse(ok, { type: 'error', status: 500, error: { message: 'x', id: 'ab12cd34' } })!;
		expect(e.kind).toBe('server');
		expect(e.id).toBe('ab12cd34');
	});

	it('keeps the server text of validation failures, and maps 404 failures to not-found', () => {
		const e = classifyResponse(ok, { type: 'failure', status: 400, data: { error: 'Enter a room name.' } })!;
		expect(e.kind).toBe('validation');
		expect(messageFor(e)).toBe('Enter a room name.');
		expect(classifyResponse(ok, { type: 'failure', status: 404, data: {} })?.kind).toBe('not-found');
	});
});

describe('classifyThrown', () => {
	it('is offline when the browser says so, otherwise network', () => {
		vi.stubGlobal('navigator', { onLine: false });
		expect(classifyThrown(new TypeError('Failed to fetch')).kind).toBe('offline');
		vi.stubGlobal('navigator', { onLine: true });
		expect(classifyThrown(new TypeError('Failed to fetch')).kind).toBe('network');
	});

	it('passes an ActionError through', () => {
		const e = new ActionError('session');
		expect(classifyThrown(e)).toBe(e);
	});
});

describe('messageFor', () => {
	it('uses the fixed wording and never leaks technical text', () => {
		expect(messageFor(new ActionError('offline'))).toBe("You're offline. Check your connection and try again.");
		expect(messageFor(new ActionError('network'))).toBe("Couldn't reach the server. Check your connection and try again.");
		expect(messageFor(new ActionError('session'))).toBe('Your session has expired. Sign in again to continue.');
		expect(messageFor(new ActionError('not-found'))).toBe('That item no longer exists. It may have been deleted.');
		expect(messageFor(new ActionError('server'))).toBe('Something went wrong on our side. Try again in a moment.');
		expect(messageFor(new ActionError('server', undefined, 'ab12cd34'))).toBe(
			'Something went wrong on our side. Try again in a moment. (Error id: ab12cd34)'
		);
		vi.stubGlobal('navigator', { onLine: true });
		expect(messageFor(new SyntaxError('Unexpected token b in JSON'))).toBe(
			'Something went wrong on our side. Try again in a moment.'
		);
	});
});
