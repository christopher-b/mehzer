<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
	import { enhance } from '$app/forms';
	import { failureMessage } from '#lib/client/actions.ts';
	import { submitWith } from '#lib/client/enhance.ts';
	import { NAME_MAX_LENGTH } from '#lib/constants.ts';
	import { UNIT_OPTIONS, type UnitSystem } from '#lib/units.ts';

	/**
	 * A project's name and units with Cancel and a submit button, for creating a project and for
	 * editing one. The caller owns the values and the error so it can set them when its dialog opens,
	 * and decides what `ondone` (the save worked) and `oncancel` do.
	 */
	let {
		action,
		name = $bindable(''),
		unitSystem = $bindable('imperial'),
		error = $bindable(''),
		placeholder,
		submitLabel,
		before,
		ondone,
		oncancel
	}: {
		/** The page action to post to, for example `?/create` or `/p/{id}?/update`. */
		action: string;
		name?: string;
		unitSystem?: UnitSystem;
		error?: string;
		placeholder?: string;
		submitLabel: string;
		/** Runs when a submit starts, after this form has cleared its own error. */
		before?: () => void;
		ondone?: () => void;
		oncancel: () => void;
	} = $props();

	let busy = $state(false);
</script>

<form
	method="POST"
	{action}
	use:enhance={submitWith({
		reset: false,
		// The action may belong to another page (the project list posts to a project's page); stay put.
		navigate: false,
		pending: (p) => (busy = p),
		before: () => {
			error = '';
			before?.();
		},
		onFailure: (result) => (error = failureMessage(result, 'Could not save the project')),
		onError: (message) => (error = message),
		onSuccess: ondone
	})}
>
	<label>
		Project name
		<input name="name" bind:value={name} {placeholder} maxlength={NAME_MAX_LENGTH} autocomplete="off" required />
	</label>
	<label>
		Units
		<select name="unitSystem" bind:value={unitSystem}>
			{#each UNIT_OPTIONS as unit (unit.value)}
				<option value={unit.value}>{unit.label}</option>
			{/each}
		</select>
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
		gap: 0.9rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
		font-weight: 600;
	}
</style>
