<script lang="ts">
	import { enhance } from '$app/forms';
	import { submitWith } from '#lib/client/enhance.ts';
	import { NAME_MAX_LENGTH } from '#lib/constants.ts';

	let {
		room,
		ondone
	}: { room: { id: string; name: string }; ondone: () => void } = $props();

	let error = $state('');
</script>

<form
	method="POST"
	action="?/renameRoom"
	class="rename"
	use:enhance={submitWith({
		reset: false,
		before: () => (error = ''),
		onError: (message) => (error = message),
		onSuccess: ondone
	})}
>
	<input type="hidden" name="roomId" value={room.id} />
	<input name="name" value={room.name} maxlength={NAME_MAX_LENGTH} required aria-label="Room name" />
	<button type="submit" class="primary">Save</button>
	<button type="button" onclick={ondone}>Cancel</button>
	{#if error}<p class="error">{error}</p>{/if}
</form>

<style>
	.rename {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
	}
	.error {
		flex: 1 1 100%;
		margin: 0;
	}
	.rename input {
		flex: 1 1 8rem;
	}
</style>
