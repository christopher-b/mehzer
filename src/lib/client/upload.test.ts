import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/image.ts', () => ({ resizeImage: vi.fn() }));

import { ActionError } from './errors.ts';
import { UPLOAD_TIMEOUT_MS, sendPhoto } from './upload.ts';

class FakeXhr {
	static last: FakeXhr;
	timeout = 0;
	status = 0;
	responseText = '';
	responseURL = '';
	upload: { onprogress?: unknown } = {};
	onerror?: () => void;
	onabort?: () => void;
	ontimeout?: () => void;
	onload?: () => void;
	aborted = false;
	constructor() {
		FakeXhr.last = this;
	}
	open() {}
	setRequestHeader() {}
	send() {}
	abort() {
		this.aborted = true;
		this.onabort?.();
	}
}

const prepared = { blob: new Blob(['x']), width: 1, height: 1 };

afterEach(() => vi.unstubAllGlobals());

describe('sendPhoto', () => {
	it('gives up on a stalled connection after the timeout, with a retryable network error', async () => {
		vi.stubGlobal('XMLHttpRequest', FakeXhr);
		const sent = sendPhoto('p1', prepared, null, () => {});
		expect(FakeXhr.last.timeout).toBe(UPLOAD_TIMEOUT_MS);
		FakeXhr.last.ontimeout!();
		const error = await sent.catch((e) => e);
		expect(error).toBeInstanceOf(ActionError);
		expect(['network', 'offline']).toContain(error.kind);
	});

	it('stops the request when its signal aborts, and never starts one that is already aborted', async () => {
		vi.stubGlobal('XMLHttpRequest', FakeXhr);
		const controller = new AbortController();
		const sent = sendPhoto('p1', prepared, null, () => {}, controller.signal);
		controller.abort();
		expect(FakeXhr.last.aborted).toBe(true);
		await expect(sent).rejects.toBeInstanceOf(ActionError);

		const before = FakeXhr.last;
		await expect(sendPhoto('p1', prepared, null, () => {}, controller.signal)).rejects.toBeInstanceOf(ActionError);
		expect(FakeXhr.last).toBe(before);
	});
});
