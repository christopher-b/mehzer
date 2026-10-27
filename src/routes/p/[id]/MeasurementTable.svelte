<script lang="ts">
	import { formatValue, measurementName } from '#lib/measurements.ts';
	import type { UnitSystem } from '#lib/units.ts';
	import MeasurementRow from './MeasurementRow.svelte';
	import type { PageData } from './$types';

	let {
		projectId,
		annotations,
		rooms,
		photoNumbers,
		unitSystem
	}: {
		projectId: string;
		annotations: PageData['annotations'];
		rooms: { id: string; name: string }[];
		photoNumbers: Map<string, number>;
		unitSystem: UnitSystem;
	} = $props();

	let roomFilter = $state('all');

	const roomNames = $derived(new Map(rooms.map((r) => [r.id, r.name])));
	// A room deleted while it is chosen falls back to "All rooms", which is what the select then shows.
	const filter = $derived(
		roomFilter === 'all' || roomFilter === 'none' || rooms.some((r) => r.id === roomFilter) ? roomFilter : 'all'
	);
	const visible = $derived(
		annotations.filter((a) => (filter === 'all' ? true : filter === 'none' ? a.roomId === null : a.roomId === filter))
	);
</script>

<section aria-labelledby="measurements-heading">
	<div class="toolbar">
		<h2 id="measurements-heading">Measurements</h2>
		<select value={filter} onchange={(e) => (roomFilter = e.currentTarget.value)} aria-label="Filter by room">
			<option value="all">All rooms</option>
			<option value="none">No room</option>
			{#each rooms as room (room.id)}
				<option value={room.id}>{room.name}</option>
			{/each}
		</select>
	</div>
	{#if visible.length === 0}
		<p class="empty">No measurements match this filter.</p>
	{:else}
		<ul class="measurements">
			{#each visible as a (a.id)}
				<MeasurementRow
					variant="card"
					href="/p/{projectId}/photo/{a.photoId}?select={a.id}"
					name={measurementName(a)}
					value={formatValue(a.valueMm, unitSystem, '—')}
					room={a.roomId ? roomNames.get(a.roomId) : ''}
					photo={photoNumbers.get(a.photoId)}
				/>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.toolbar h2 {
		margin: 1.5rem 1rem 1rem 0;
	}
	.empty {
		margin: 0.4rem 0;
	}
	.measurements {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
</style>
