<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Forgot password · Mehzur</title></svelte:head>

<div class="auth">
	<h1>Forgot your password?</h1>
	{#if form?.sent}
		<p>If that address has an account, we have sent it a link to choose a new password. The link works for one hour.</p>
	{:else if form?.unavailable}
		<p>Email is not set up on this server. Ask the administrator to send you a reset link.</p>
	{:else}
		<p>Enter your email address and we will send you a link to choose a new password.</p>
		<form method="POST">
			<label>
				Email
				<!-- svelte-ignore a11y_autofocus -->
				<input type="email" name="email" value={form?.email ?? ''} autocomplete="username" required autofocus />
			</label>
			<FormError message={form?.error} />
			<button type="submit" class="primary">Send the link</button>
		</form>
	{/if}
	<p class="note"><a href="/login">Back to sign in</a></p>
</div>
