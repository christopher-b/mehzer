<script lang="ts">
	import { enhance } from '$app/forms';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { submitWith } from '#lib/client/enhance.ts';
	import PopupMenu from '#lib/components/ui/PopupMenu.svelte';
	import type { UnitSystem } from '#lib/units.ts';
	import RoomAreaForm from './RoomAreaForm.svelte';
	import RoomRenameDialog from './RoomRenameDialog.svelte';

	let {
		room,
		measured,
		unitSystem
	}: {
		room: { id: string; name: string; areaAAnnotationId: string | null; areaBAnnotationId: string | null };
		measured: { id: string; name: string | null; valueMm: number | null; number: number }[];
		unitSystem: UnitSystem;
	} = $props();

	let renaming = $state(false);
</script>

<PopupMenu label="Menu for {room.name}" kind="panel" wide>
	{#snippet children(close)}
		<button
			type="button"
			class="item"
			onclick={() => {
				close(true);
				renaming = true;
			}}
		>
			<Pencil size={18} />Rename
		</button>
		{#if measured.length >= 2}
			<RoomAreaForm {room} {measured} {unitSystem} ondone={close} />
		{/if}
		<form
			method="POST"
			action="?/deleteRoom"
			use:enhance={submitWith({
				before: close,
				confirm: () =>
					confirm(`Delete room "${room.name}"? Its photos move to No room and its measurements are kept.`)
			})}
		>
			<input type="hidden" name="roomId" value={room.id} />
			<button type="submit" class="item danger-item"><Trash2 size={18} />Delete room</button>
		</form>
	{/snippet}
</PopupMenu>

<RoomRenameDialog bind:open={renaming} {room} />
