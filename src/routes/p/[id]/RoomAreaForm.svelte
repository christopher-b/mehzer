<script lang="ts">
	import { enhance } from '$app/forms';
	import { failureMessage } from '#lib/client/actions.ts';
	import { submitWith } from '#lib/client/enhance.ts';
	import { optionLabel } from '#lib/measurements.ts';
	import type { UnitSystem } from '#lib/units.ts';

	let {
		room,
		measured,
		unitSystem,
		ondone
	}: {
		room: { id: string; areaAAnnotationId: string | null; areaBAnnotationId: string | null };
		measured: { id: string; name: string | null; valueMm: number | null; number: number }[];
		unitSystem: UnitSystem;
		ondone: () => void;
	} = $props();

	let error = $state('');
	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/setRoomArea"
	class="area-form"
	use:enhance={submitWith({
		pending: (p) => (busy = p),
		reset: false,
		before: () => (error = ''),
		onFailure: (result) => (error = failureMessage(result, 'Could not calculate')),
		onError: (message) => (error = message),
		onSuccess: ondone
	})}
>
	<input type="hidden" name="roomId" value={room.id} />
	<div class="menu-heading">Calculate area</div>
	<select name="areaA" aria-label="First measurement (length)" value={room.areaAAnnotationId ?? ''}>
		<option value="">Choose…</option>
		{#each measured as a (a.id)}
			<option value={a.id}>{optionLabel(a, unitSystem)}</option>
		{/each}
	</select>
	<span class="times" aria-hidden="true">×</span>
	<select name="areaB" aria-label="Second measurement (width)" value={room.areaBAnnotationId ?? ''}>
		<option value="">Choose…</option>
		{#each measured as a (a.id)}
			<option value={a.id}>{optionLabel(a, unitSystem)}</option>
		{/each}
	</select>
	{#if error}<p class="error">{error}</p>{/if}
	<button type="submit" class="calc" disabled={busy} aria-busy={busy}>Calculate</button>
</form>

<style>
	.area-form {
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0.6rem 0.5rem;
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}
	.area-form select {
		width: 100%;
		min-width: 0;
	}
	.menu-heading {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-secondary);
	}
	.times {
		text-align: center;
		color: var(--text-muted);
	}
	.error {
		margin: 0;
		font-size: 0.9rem;
	}
	.calc {
		border: 1px solid var(--border-strong);
		background: var(--surface);
		text-align: center;
		font-weight: 600;
	}
	.calc:hover {
		background: var(--hover);
	}
</style>
