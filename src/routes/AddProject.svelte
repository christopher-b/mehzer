<script lang="ts">
	import { enhance } from '$app/forms';
	import Plus from '@lucide/svelte/icons/plus';
	import { failureMessage } from '#lib/client/actions.ts';
	import { submitWith } from '#lib/client/enhance.ts';
	import AddTile from '#lib/components/ui/AddTile.svelte';
	import PopupMenu from '#lib/components/ui/PopupMenu.svelte';
	import { NAME_MAX_LENGTH } from '#lib/constants.ts';
	import { UNIT_OPTIONS } from '#lib/units.ts';

	let error = $state('');
</script>

<div class="add-project">
	<PopupMenu label="Add a project" kind="dialog" align="center" onopen={() => (error = '')}>
		{#snippet trigger(props)}
			<AddTile mode="button" {...props}><Plus size={22} aria-hidden="true" />Project</AddTile>
		{/snippet}
		{#snippet children(close)}
			<form
				method="POST"
				action="?/create"
				use:enhance={submitWith({
					before: () => (error = ''),
					onFailure: (result) => (error = failureMessage(result, 'Could not create the project')),
					onError: (message) => (error = message)
				})}
			>
				<label>
					Project name
					<input name="name" placeholder="e.g. 12 Elm St" maxlength={NAME_MAX_LENGTH} autocomplete="off" required />
				</label>
				<label>
					Units
					<select name="unitSystem">
						{#each UNIT_OPTIONS as unit (unit.value)}
							<option value={unit.value}>{unit.label}</option>
						{/each}
					</select>
				</label>
				{#if error}<p class="error">{error}</p>{/if}
				<div class="popover-buttons">
					<button type="button" onclick={() => close(true)}>Cancel</button>
					<button type="submit" class="primary">Create</button>
				</div>
			</form>
		{/snippet}
	</PopupMenu>
</div>

<style>
	.add-project {
		display: flex;
		justify-content: center;
		margin: 1.25rem 0;
	}
	form {
		display: grid;
		gap: 0.75rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
		font-weight: 600;
	}
	.error {
		margin: 0;
	}
	.popover-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
