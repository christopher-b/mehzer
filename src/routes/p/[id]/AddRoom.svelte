<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { onMount } from 'svelte';
	import { saveDraft, takeDraft } from '#lib/client/drafts.ts';
	import AddTile from '#lib/components/ui/AddTile.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import RoomNameForm from './RoomNameForm.svelte';

	let open = $state(false);
	let error = $state('');
	let name = $state('');

	// Back from signing in again: reopen the dialog with the name that was being typed.
	onMount(() => {
		const draft = takeDraft();
		if (draft?.kind !== 'room') return;
		name = draft.name;
		open = true;
	});
</script>

<div class="add-room">
	<AddTile mode="button" aria-haspopup="dialog" onclick={() => (open = true)}>
		<Plus size={22} aria-hidden="true" />Room
	</AddTile>
</div>

<Dialog bind:open title="Add a room" onopen={() => (error = '')}>
	{#snippet children(close)}
		<RoomNameForm
			action="?/createRoom"
			bind:name
			bind:error
			placeholder="e.g. Kitchen"
			submitLabel="Add room"
			onsession={() => saveDraft({ kind: 'room', name })}
			ondone={() => {
				name = '';
				close();
			}}
			oncancel={close}
		/>
	{/snippet}
</Dialog>

<style>
	.add-room {
		display: flex;
		justify-content: center;
		margin: 1.25rem 0;
	}
</style>
