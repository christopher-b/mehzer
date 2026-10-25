<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
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
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button type="submit" class="primary">Sign in</button>
	</form>
	<p class="note"><a href="/forgot">Forgot your password?</a></p>
</div>
