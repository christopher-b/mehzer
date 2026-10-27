<script lang="ts">
	import { enhance } from '$app/forms';
	import { submitWith } from '#lib/client/enhance.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Confirm email · Mehzur</title></svelte:head>

<div class="auth">
	<h1>Change your email address</h1>
	{#if form?.changed}
		<p role="status">Your email address is now <strong>{form.changed}</strong>. Use it to sign in. Your other devices were signed out.</p>
		<p><a href="/account">Back to your account</a></p>
	{:else if data.newEmail}
		<p>Change the email address of your account to <strong>{data.newEmail}</strong>?</p>
		<form method="POST" use:enhance={submitWith()}>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<button type="submit" class="primary">Change my email address</button>
		</form>
	{:else}
		<p>
			This link is no longer valid. It may have expired, already been used, or belong to a different account than the one you
			are signed in to.
		</p>
		<p><a href="/account">Back to your account</a></p>
	{/if}
</div>
