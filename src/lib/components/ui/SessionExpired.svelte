<script lang="ts">
	import { page } from '$app/state';
	import { sessionPrompt } from '#lib/client/session.svelte.ts';
	import Modal from './Modal.svelte';

	// Sign in, then come back to this page (never to an action address).
	const signInHref = $derived(`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`);
</script>

<Modal bind:open={sessionPrompt.open} title="Signed out">
	<p>Your session has expired. Sign in again to continue.</p>
	{#snippet footer(close)}
		<span class="spacer"></span>
		<button type="button" onclick={close}>Cancel</button>
		<a class="primary" href={signInHref} data-sveltekit-reload>Sign in</a>
	{/snippet}
</Modal>

<style>
	p {
		margin: 0;
	}
	a.primary {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		text-decoration: none;
	}
</style>
