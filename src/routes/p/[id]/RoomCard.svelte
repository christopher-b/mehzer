<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		title,
		collapsed,
		summary,
		variant,
		renaming = false,
		ontoggle,
		menu,
		rename,
		children
	}: {
		id: string;
		title: string;
		collapsed: boolean;
		/** One line shown instead of the content while collapsed. */
		summary: string;
		variant?: 'unassigned';
		/** While true, `rename` replaces the title and the menu. */
		renaming?: boolean;
		ontoggle: () => void;
		menu?: Snippet;
		rename?: Snippet;
		children: Snippet;
	} = $props();
</script>

<article class="room" class:no-room={variant === 'unassigned'} aria-labelledby="room-title-{id}">
	<header>
		{#if renaming && rename}
			{@render rename()}
		{:else}
			<h3 id="room-title-{id}">
				<button
					type="button"
					class="toggle"
					class:collapsed
					aria-expanded={!collapsed}
					aria-controls="room-{id}"
					onclick={ontoggle}
				>
					{title}
				</button>
			</h3>
			{#if menu}
				<span class="spacer"></span>
				{@render menu()}
			{/if}
		{/if}
	</header>

	{#if collapsed}
		<p class="summary">{summary}</p>
	{:else}
		<div id="room-{id}">
			{@render children()}
		</div>
	{/if}
</article>

<style>
	.room {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.8rem;
	}
	.room.no-room {
		background: var(--surface-muted);
		border-style: dashed;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	h3 {
		margin: 0;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.15rem 0.2rem;
		border: none;
		background: none;
		font-weight: 700;
		font-size: 1.1rem;
		text-align: left;
	}
	.toggle::before {
		/* Decorative: the empty alternative text keeps it out of the button's accessible name
		   (the plain declaration first is the fallback for browsers without that syntax). */
		content: '▾';
		content: '▾' / '';
		display: inline-block;
		width: 1.1rem;
		font-size: 1.1rem;
		line-height: 1;
		color: var(--text-muted);
		transition: transform 0.12s;
	}
	.toggle.collapsed::before {
		transform: rotate(-90deg);
	}
	.toggle:hover::before {
		color: var(--accent);
	}
	.summary {
		margin: 0.4rem 0 0;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
</style>
