<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { projectEdit } from '#lib/client/projectEdit.svelte.ts';
	import { submitWith } from '#lib/client/enhance.ts';
	import { NAME_MAX_LENGTH } from '#lib/constants.ts';
	import { UNIT_OPTIONS, type UnitSystem } from '#lib/units.ts';

	let { project }: { project: { name: string; unitSystem: UnitSystem } } = $props();

	// The form is opened from the header's project menu; leaving the page closes it.
	onMount(() => () => (projectEdit.editing = false));
</script>

{#if projectEdit.editing}
	<form
		method="POST"
		action="?/update"
		class="edit"
		use:enhance={submitWith({ reset: false, onSuccess: () => (projectEdit.editing = false) })}
	>
		<input name="name" value={project.name} maxlength={NAME_MAX_LENGTH} required aria-label="Name" />
		<select name="unitSystem" value={project.unitSystem} aria-label="Units">
			{#each UNIT_OPTIONS as unit (unit.value)}
				<option value={unit.value}>{unit.label}</option>
			{/each}
		</select>
		<button type="submit" class="primary">Save</button>
		<button type="button" onclick={() => (projectEdit.editing = false)}>Cancel</button>
	</form>
	<form
		method="POST"
		action="?/delete"
		use:enhance={submitWith({
			confirm: () => confirm(`Delete "${project.name}" and all its photos and measurements?`)
		})}
	>
		<button type="submit" class="danger">Delete project</button>
	</form>
{/if}

<style>
	.edit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.75rem 0 0.5rem;
	}
	.edit input {
		flex: 1 1 14rem;
	}
</style>
