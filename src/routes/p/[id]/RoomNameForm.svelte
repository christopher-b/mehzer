<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
	import { enhance } from '$app/forms';
	import { inlineErrors, submitWith } from '#lib/client/enhance.ts';
	import { NAME_MAX_LENGTH } from '#lib/constants.ts';

	/**
	 * A room's name and Save / Cancel, for adding a room and for renaming one. The caller owns `name`
	 * and `error` so it can set them when its popup opens, and decides what `ondone` and `oncancel` do.
	 */
	let {
		action,
		roomId,
		name = $bindable(''),
		error = $bindable(''),
		placeholder,
		submitLabel,
		onsession,
		ondone,
		oncancel
	}: {
		/** The page action to post to, for example `?/createRoom`. */
		action: string;
		/** Sent with the form when an existing room is being changed. */
		roomId?: string;
		name?: string;
		error?: string;
		placeholder?: string;
		submitLabel: string;
		/** Runs when the session has expired, before the "Signed out" prompt opens. */
		onsession?: () => void;
		ondone: () => void;
		oncancel: () => void;
	} = $props();

	let busy = $state(false);
</script>

<form
	method="POST"
	{action}
	use:enhance={submitWith({
		pending: (p) => (busy = p),
		reset: false,
		...inlineErrors((message) => (error = message), 'Could not save the room'),
		onSession: onsession,
		onSuccess: ondone
	})}
>
	{#if roomId}<input type="hidden" name="roomId" value={roomId} />{/if}
	<label>
		Room name
		<input name="name" bind:value={name} {placeholder} maxlength={NAME_MAX_LENGTH} autocomplete="off" required />
	</label>
	<FormError message={error} style="margin: 0" />
	<div class="buttons">
		<span class="spacer"></span>
		<button type="button" onclick={oncancel}>Cancel</button>
		<button type="submit" class="primary" disabled={busy} aria-busy={busy}>{submitLabel}</button>
	</div>
</form>

<style>
	form {
		display: grid;
		gap: 0.75rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
		font-weight: 600;
	}
</style>
