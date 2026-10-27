import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/image.ts', async (original) => ({ ...(await original<typeof import('#lib/image.ts')>()), resizeImage: vi.fn() }));

import { ActionError } from './errors.ts';
import { UnreadableImageError, resizeImage } from '#lib/image.ts';
import { RefusedError, UPLOAD_TIMEOUT_MS, prepareImage, sendPhoto } from './upload.ts';

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

describe('sendPhoto answers', () => {
	const answer = async (status: number, body: unknown, responseURL = '') => {
		vi.stubGlobal('XMLHttpRequest', FakeXhr);
		const sent = sendPhoto('p1', prepared, null, () => {});
		Object.assign(FakeXhr.last, { status, responseText: typeof body === 'string' ? body : JSON.stringify(body), responseURL });
		FakeXhr.last.onload!();
		return sent.then(
			(id) => ({ id }),
			(error) => ({ error })
		);
	};

	it('resolves with the new photo id', async () => {
		expect(await answer(201, { id: 'ph1' })).toEqual({ id: 'ph1' });
	});

	it('is a session problem for a 401 or a redirect to the sign-in page', async () => {
		expect(((await answer(401, {})) as { error: ActionError }).error.kind).toBe('session');
		expect(((await answer(200, '<html>', 'http://x/login?next=/')) as { error: ActionError }).error.kind).toBe('session');
	});

	it('refuses a file with the server\'s own message for a 4xx, and calls it a server error without one', async () => {
		const refused = (await answer(413, { message: 'Image must be under 15 MB' })) as { error: Error };
		expect(refused.error).toBeInstanceOf(RefusedError);
		expect(refused.error.message).toBe('Image must be under 15 MB');
		expect(((await answer(400, 'nope')) as { error: ActionError }).error.kind).toBe('server');
	});

	it('is a retryable server error for a 5xx, carrying the error id', async () => {
		const { error } = (await answer(500, { id: 'ab12' })) as { error: ActionError };
		expect(error.kind).toBe('server');
		expect(error.id).toBe('ab12');
	});

	it('is a network error when the request fails', async () => {
		vi.stubGlobal('XMLHttpRequest', FakeXhr);
		const sent = sendPhoto('p1', prepared, null, () => {});
		FakeXhr.last.onerror!();
		expect((await sent.catch((e) => e)).kind).toMatch(/network|offline/);
	});
});

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

describe('prepareImage', () => {
	const file = new File(['x'], 'a.jpg');

	it('refuses a file the browser cannot decode', async () => {
		vi.mocked(resizeImage).mockRejectedValueOnce(new UnreadableImageError('no'));
		await expect(prepareImage(file)).rejects.toBeInstanceOf(RefusedError);
	});

	it('lets any other failure through, so the upload can be retried', async () => {
		const failure = new Error('Could not encode image');
		vi.mocked(resizeImage).mockRejectedValueOnce(failure);
		await expect(prepareImage(file)).rejects.toBe(failure);
	});
});
