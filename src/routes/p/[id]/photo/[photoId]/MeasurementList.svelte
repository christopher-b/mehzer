<script lang="ts">
	import { formatValue, measurementName } from '#lib/measurements.ts';
	import type { UnitSystem } from '#lib/units.ts';

	let {
		annotations,
		selectedId,
		unitSystem,
		busy,
		onselect,
		onedit,
		ondelete
	}: {
		annotations: { id: string; name: string | null; valueMm: number | null; number: number }[];
		selectedId: string | null;
		unitSystem: UnitSystem;
		busy: boolean;
		onselect: (id: string) => void;
		onedit: (id: string) => void;
		ondelete: (id: string) => void;
	} = $props();
</script>

<aside>
	<h2>Measurements</h2>
	{#if annotations.length === 0}
		<p class="empty">None yet.</p>
	{:else}
		<ul>
			{#each annotations as a (a.id)}
				<li class:selected={a.id === selectedId}>
					<button type="button" class="row" aria-pressed={a.id === selectedId} onclick={() => onselect(a.id)}>
						<span class="name">{measurementName(a)}</span>
						<span class="value">{formatValue(a.valueMm, unitSystem, '—')}</span>
					</button>
					<div class="actions">
						<button type="button" disabled={busy} aria-label="Edit {measurementName(a)}" onclick={() => onedit(a.id)}>Edit</button>
						<button type="button" class="danger" disabled={busy} aria-label="Delete {measurementName(a)}" onclick={() => ondelete(a.id)}>
							Delete
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</aside>

<style>
	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}
	li {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
	}
	li.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		text-align: left;
	}
	.name {
		flex: 1;
		font-weight: 600;
	}
	.value {
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.actions button {
		padding: 0.2rem 0.6rem;
		font-size: 0.85rem;
	}
</style>
