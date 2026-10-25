<script lang="ts">
	import type { PageData } from './$types';

	let {
		projectId,
		roomName,
		neighbours
	}: { projectId: string; roomName: string; neighbours: PageData['neighbours'] } = $props();
</script>

<nav class="photo-nav" aria-label="Photos in {roomName}">
	{#if neighbours.previous}
		<a
			class="nav-button"
			rel="prev"
			href="/p/{projectId}/photo/{neighbours.previous.id}"
			aria-keyshortcuts="ArrowLeft"
		>
			‹ Previous
		</a>
	{:else}
		<span class="nav-button disabled" aria-disabled="true">‹ Previous</span>
	{/if}
	<span class="nav-count">{neighbours.position} of {neighbours.total}</span>
	{#if neighbours.next}
		<a
			class="nav-button"
			rel="next"
			href="/p/{projectId}/photo/{neighbours.next.id}"
			aria-keyshortcuts="ArrowRight"
		>
			Next ›
		</a>
	{:else}
		<span class="nav-button disabled" aria-disabled="true">Next ›</span>
	{/if}
</nav>

<style>
	.photo-nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.nav-button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
	a.nav-button:hover {
		border-color: var(--accent);
	}
	.nav-button.disabled {
		border-color: var(--border);
		background: var(--surface-disabled);
		color: var(--text-disabled);
	}
	.nav-count {
		min-width: 5.5rem;
		color: var(--text-secondary);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
</style>
