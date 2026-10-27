<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
	import { enhance } from '$app/forms';
	import { submitWith } from '#lib/client/enhance.ts';
	import ProjectForm from '#lib/components/ProjectForm.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import type { UnitSystem } from '#lib/units.ts';

	let {
		open = $bindable(false),
		project,
		canDelete
	}: {
		open?: boolean;
		project: { id: string; name: string; unitSystem: UnitSystem };
		canDelete: boolean;
	} = $props();

	let name = $state('');
	let unitSystem = $state<UnitSystem>('imperial');
	let error = $state('');
	let deleteError = $state('');
	let deleting = $state(false);
</script>

<Dialog
	bind:open
	title="Edit project"
	onopen={() => {
		name = project.name;
		unitSystem = project.unitSystem;
		error = deleteError = '';
	}}
>
	{#snippet children(close)}
		<ProjectForm
			action="/p/{project.id}?/update"
			bind:name
			bind:unitSystem
			bind:error
			submitLabel="Save"
			before={() => (deleteError = '')}
			ondone={close}
			oncancel={close}
		/>
		{#if canDelete}
			<form
				method="POST"
				action="/p/{project.id}?/delete"
				class="delete"
				use:enhance={submitWith({
					navigate: false,
					pending: (p) => (deleting = p),
					before: () => (error = deleteError = ''),
					onError: (message) => (deleteError = message),
					confirm: () => confirm(`Delete "${project.name}" and all its photos and measurements?`)
				})}
			>
				<button type="submit" class="danger" disabled={deleting} aria-busy={deleting}>Delete project</button>
				<FormError message={deleteError} style="margin: 0.6rem 0 0" />
			</form>
		{/if}
	{/snippet}
</Dialog>

<style>
	.delete {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
</style>
