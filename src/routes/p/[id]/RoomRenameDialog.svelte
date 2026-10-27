<script lang="ts">
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import RoomNameForm from './RoomNameForm.svelte';

	let {
		open = $bindable(false),
		room
	}: { open?: boolean; room: { id: string; name: string } } = $props();

	let name = $state('');
	let error = $state('');
</script>

<Dialog
	bind:open
	title="Rename room"
	onopen={() => {
		name = room.name;
		error = '';
	}}
>
	{#snippet children(close)}
		<RoomNameForm
			action="?/renameRoom"
			roomId={room.id}
			bind:name
			bind:error
			submitLabel="Save"
			ondone={close}
			oncancel={close}
		/>
	{/snippet}
</Dialog>
