<script lang="ts">
	import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '#lib/constants.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Join · Mehzur</title></svelte:head>

<div class="auth">
	<h1>Join Mehzur</h1>
	{#if data.valid}
		<p>Create your account.</p>
		<form method="POST">
			<label>
				Your name
				<!-- svelte-ignore a11y_autofocus -->
				<input name="name" value={form?.name ?? ''} maxlength={NAME_MAX_LENGTH} autocomplete="name" required autofocus />
			</label>
			<label>
				Email
				<input
					type="email"
					name="email"
					value={data.email ?? form?.email ?? ''}
					readonly={data.email !== null}
					autocomplete="username"
					required
				/>
			</label>
			<label>
				Password
				<input type="password" name="password" minlength={PASSWORD_MIN_LENGTH} autocomplete="new-password" required />
			</label>
			<label>
				Repeat the password
				<input type="password" name="confirm" minlength={PASSWORD_MIN_LENGTH} autocomplete="new-password" required />
			</label>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<button type="submit" class="primary">Create account</button>
		</form>
	{:else}
		<p>This invite link is no longer valid. It may have expired, been revoked or already been used. Ask for a new one.</p>
		<p class="note"><a href="/login">Sign in</a></p>
	{/if}
</div>
