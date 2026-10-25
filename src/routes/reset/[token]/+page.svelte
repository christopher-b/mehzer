<script lang="ts">
	import { PASSWORD_MIN_LENGTH } from '#lib/constants.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>New password · Mehzur</title></svelte:head>

<div class="auth">
	<h1>Choose a new password</h1>
	{#if data.valid}
		<form method="POST">
			<label>
				New password
				<input type="password" name="password" minlength={PASSWORD_MIN_LENGTH} autocomplete="new-password" required />
			</label>
			<label>
				Repeat the password
				<input type="password" name="confirm" minlength={PASSWORD_MIN_LENGTH} autocomplete="new-password" required />
			</label>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<button type="submit" class="primary">Set the password</button>
		</form>
	{:else}
		<p>This reset link is no longer valid. It may have expired or already been used.</p>
		<p><a href="/forgot">Ask for a new link</a></p>
	{/if}
</div>
