<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { saveDraft, takeDraft } from '#lib/client/drafts.ts';
	import { failureMessage } from '#lib/client/actions.ts';
	import { submitWith } from '#lib/client/enhance.ts';
	import AddTile from '#lib/components/ui/AddTile.svelte';
	import PopupMenu from '#lib/components/ui/PopupMenu.svelte';
	import { NAME_MAX_LENGTH } from '#lib/constants.ts';

	let error = $state('');
	let name = $state('');
	let popup: ReturnType<typeof PopupMenu>;

	// Back from signing in again: reopen the popover with the name that was being typed.
	onMount(() => {
		const draft = takeDraft();
		if (draft?.kind !== 'room') return;
		name = draft.name;
		popup.show();
	});
</script>

<div class="add-room">
	<PopupMenu bind:this={popup} label="Add a room" kind="dialog" align="center" onopen={() => (error = '')}>
		{#snippet trigger(props)}
			<AddTile mode="button" {...props}>+ Room</AddTile>
		{/snippet}
		{#snippet children(close)}
			<form
				method="POST"
				action="?/createRoom"
				use:enhance={submitWith({
					before: () => (error = ''),
					onSession: () => saveDraft({ kind: 'room', name }),
					onFailure: (result) => (error = failureMessage(result, 'Could not add room')),
					onError: (message) => (error = message),
					onSuccess: () => {
						name = '';
						close();
					}
				})}
			>
				<label>
					Room name
					<input
						name="name"
						bind:value={name}
						placeholder="e.g. Kitchen"
						maxlength={NAME_MAX_LENGTH}
						autocomplete="off"
						required
					/>
				</label>
				{#if error}<p class="error">{error}</p>{/if}
				<div class="popover-buttons">
					<button type="button" onclick={() => close(true)}>Cancel</button>
					<button type="submit" class="primary">Add room</button>
				</div>
			</form>
		{/snippet}
	</PopupMenu>
</div>

<style>
	.add-room {
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
