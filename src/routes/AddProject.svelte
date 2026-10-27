<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import ProjectForm from '#lib/components/ProjectForm.svelte';
	import AddTile from '#lib/components/ui/AddTile.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import type { UnitSystem } from '#lib/units.ts';

	let open = $state(false);
	let name = $state('');
	let unitSystem = $state<UnitSystem>('imperial');
	let error = $state('');
</script>

<div class="add-project">
	<AddTile mode="button" aria-haspopup="dialog" onclick={() => (open = true)}>
		<Plus size={22} aria-hidden="true" />Project
	</AddTile>
</div>

<Dialog
	bind:open
	title="Add a project"
	onopen={() => {
		name = '';
		unitSystem = 'imperial';
		error = '';
	}}
>
	{#snippet children(close)}
		<ProjectForm
			action="?/create"
			bind:name
			bind:unitSystem
			bind:error
			placeholder="e.g. 12 Elm St"
			submitLabel="Create"
			oncancel={close}
		/>
	{/snippet}
</Dialog>

<style>
	.add-project {
		display: flex;
		justify-content: center;
		margin: 1.25rem 0;
	}
</style>
