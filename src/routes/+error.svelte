<script lang="ts">
	import { page } from '$app/state';

	const status = $derived(page.status);
	const notFound = $derived(status === 404);
	const serverFault = $derived(status >= 500);
</script>

<svelte:head><title>{notFound ? 'Page not found' : 'Something went wrong'} · Mehzer</title></svelte:head>

<section>
	<h1>{notFound ? 'Page not found' : 'Something went wrong'}</h1>
	{#if serverFault}
		<p>Something went wrong on our side. Try again in a moment.</p>
		{#if page.error?.id}<p class="id">Error id: <code>{page.error.id}</code></p>{/if}
	{:else}
		<p>{page.error?.message}</p>
	{/if}
	<p class="links">
		<a href="/">Back to projects</a>
		{#if page.params.id}<a href="/p/{page.params.id}">Back to project</a>{/if}
	</p>
</section>

<style>
	section {
		max-width: 32rem;
		margin: 3rem auto;
	}
	.id {
		color: var(--text-muted);
	}
	.links a {
		padding: 0.55rem 1rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: inherit;
		text-decoration: none;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
