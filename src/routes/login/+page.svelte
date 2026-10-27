<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { browserSupportsWebAuthn, signInWithPasskey } from '#lib/client/passkeys.ts';
	import { safeNext } from '#lib/safeNext.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let supported = $state(false);
	let busy = $state(false);
	let passkeyError = $state('');
	onMount(() => (supported = browserSupportsWebAuthn()));

	async function usePasskey() {
		busy = true;
		passkeyError = '';
		const result = await signInWithPasskey();
		if (result.ok) {
			// A full page load, so everything starts again as the signed-in person.
			window.location.assign(safeNext(page.url.searchParams.get('next')));
			return;
		}
		passkeyError = result.error;
		busy = false;
	}
</script>

<svelte:head><title>Sign in · Mehzur</title></svelte:head>

<div class="auth">
	<h1>Mehzur</h1>
	<form method="POST">
		<label>
			Email
			<!-- svelte-ignore a11y_autofocus -->
			<input type="email" name="email" value={form?.email ?? ''} autocomplete="username" required autofocus />
		</label>
		<label>
			Password
			<input type="password" name="password" autocomplete="current-password" required />
		</label>
		<FormError message={form?.error} />
		<button type="submit" class="primary">Sign in</button>
	</form>
	{#if data.passkeys && supported}
		<div class="passkey">
			<button type="button" onclick={usePasskey} disabled={busy}><KeyRound size={18} />Sign in with a passkey</button>
			<FormError message={passkeyError} />
		</div>
	{/if}
	<p class="note"><a href="/forgot">Forgot your password?</a></p>
</div>

<style>
	.passkey {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.passkey button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
</style>
