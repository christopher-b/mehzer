<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
	import Modal from '#lib/components/ui/Modal.svelte';

	let {
		open = $bindable(false),
		rooms,
		currentRoomId,
		busy,
		error,
		onsave
	}: {
		open?: boolean;
		rooms: { id: string; name: string }[];
		currentRoomId: string | null;
		busy: boolean;
		error: string;
		onsave: (roomId: string) => void;
	} = $props();

	let roomChoice = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!busy) onsave(roomChoice);
	}
</script>

<Modal bind:open title="Change room" onsubmit={submit} onopen={() => (roomChoice = currentRoomId ?? '')}>
	<label>
		Room
		<select bind:value={roomChoice}>
			<option value="">No room</option>
			{#each rooms as room (room.id)}
				<option value={room.id}>{room.name}</option>
			{/each}
		</select>
		<small>
			This photo's measurements move with it. Any room area calculated from them is cleared.
		</small>
	</label>
	<FormError message={error} />
	{#snippet footer(close)}
		<span class="spacer"></span>
		<button type="button" onclick={close}>Cancel</button>
		<button type="submit" class="primary" disabled={busy}>Save</button>
	{/snippet}
</Modal>
