<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · Mehzer</title></svelte:head>

<div class="login">
	<h1>Mehzer</h1>
	<form method="POST">
		<label>
			Password
			<!-- svelte-ignore a11y_autofocus -->
			<input type="password" name="password" autocomplete="current-password" required autofocus />
		</label>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button type="submit">Sign in</button>
	</form>
</div>

<style>
	.login {
		max-width: 20rem;
		margin: 15vh auto;
		padding: 1rem;
	}
	form {
		display: grid;
		gap: 0.75rem;
	}
	label {
		display: grid;
		gap: 0.25rem;
	}
	input,
	button {
		font: inherit;
		padding: 0.5rem;
	}
	.error {
		margin: 0;
	}
</style>
