<script lang="ts">
	let {
		href,
		name,
		value,
		photo,
		room,
		variant
	}: {
		href: string;
		name: string;
		value: string;
		photo: number | undefined;
		/** Shown in its own column when given ('' keeps the column empty). */
		room?: string;
		/** `compact` is a row inside a room card; `card` is a row in the project-wide list. */
		variant: 'compact' | 'card';
	} = $props();
</script>

<li>
	<a {href} class={variant}>
		<span class="m-name">{name}</span>
		<span class="m-value">{value}</span>
		{#if room !== undefined}<span class="m-room">{room}</span>{/if}
		<span class="m-photo">Photo {photo}</span>
	</a>
</li>

<style>
	a {
		display: flex;
		color: inherit;
		text-decoration: none;
	}
	.compact {
		gap: 0.75rem;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius-sm);
		background: var(--row-bg);
	}
	.compact:hover {
		background: var(--row-hover);
	}
	.card {
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		padding: 0.6rem 0.8rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.card:hover {
		border-color: var(--accent);
	}
	.m-name {
		flex: 1;
		font-weight: 600;
	}
	.m-value {
		font-variant-numeric: tabular-nums;
	}
	.m-room {
		color: var(--text-muted);
		min-width: 5rem;
	}
	.m-photo {
		color: var(--text-muted);
		min-width: 4.5rem;
		text-align: right;
	}
</style>
