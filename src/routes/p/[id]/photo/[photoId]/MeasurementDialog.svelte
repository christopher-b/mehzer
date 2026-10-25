<script lang="ts">
	import { tick } from 'svelte';
	import Modal from '#lib/components/ui/Modal.svelte';
	import { NAME_MAX_LENGTH } from '#lib/constants.ts';
	import { formatLength, lengthPlaceholder, parseLength, type UnitSystem } from '#lib/units.ts';

	let {
		open = $bindable(false),
		mode,
		initial,
		unitSystem,
		busy,
		error,
		onsave,
		ondelete,
		onclose
	}: {
		open?: boolean;
		mode: 'create' | 'edit';
		initial: { name: string; value: string };
		unitSystem: UnitSystem;
		busy: boolean;
		error: string;
		onsave: (fields: { name: string; value: string }) => void;
		ondelete: () => void;
		onclose?: () => void;
	} = $props();

	let valueInput = $state<HTMLInputElement>();
	let fieldName = $state('');
	let fieldValue = $state('');
	let localError = $state('');
	/** Default to the number pad; "ABC" switches the measurement field to the full keyboard. */
	let fullKeyboard = $state(false);

	const parsedValue = $derived(fieldValue.trim() ? parseLength(fieldValue, unitSystem) : null);

	async function onopen() {
		fieldName = initial.name;
		fieldValue = initial.value;
		localError = '';
		fullKeyboard = false;
		await tick();
		valueInput?.select();
	}

	function insertText(text: string) {
		const el = valueInput;
		if (!el) return;
		const start = el.selectionStart ?? el.value.length;
		el.setRangeText(text, start, el.selectionEnd ?? start, 'end');
		fieldValue = el.value;
		el.focus();
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (fieldValue.trim() && parsedValue === null) {
			localError = `Couldn't understand "${fieldValue}"`;
			return;
		}
		localError = '';
		onsave({ name: fieldName, value: fieldValue });
	}
</script>

<Modal
	bind:open
	title={mode === 'edit' ? 'Edit measurement' : 'New measurement'}
	onsubmit={submit}
	{onopen}
	{onclose}
>
	<label>
		Measurement
		<input
			bind:this={valueInput}
			bind:value={fieldValue}
			placeholder={lengthPlaceholder(unitSystem)}
			autocomplete="off"
			inputmode={fullKeyboard ? 'text' : 'decimal'}
		/>
		<small class:error={fieldValue.trim() && parsedValue === null}>
			{#if !fieldValue.trim()}
				Optional. Leave blank to fill in later.
			{:else if parsedValue === null}
				Not recognised
			{:else}
				= {formatLength(parsedValue, unitSystem)}
			{/if}
		</small>
	</label>
	<div class="keys">
		{#each unitSystem === 'imperial' ? ["'", '"'] : ['m', 'cm', 'mm'] as key (key)}
			<button type="button" onpointerdown={(e) => e.preventDefault()} onclick={() => insertText(key)}>
				{key}
			</button>
		{/each}
		<span class="spacer"></span>
		<button
			type="button"
			onpointerdown={(e) => e.preventDefault()}
			onclick={() => {
				fullKeyboard = !fullKeyboard;
				valueInput?.focus();
			}}
		>
			{fullKeyboard ? '123' : 'ABC'}
		</button>
	</div>
	<label>
		<span>Name <span class="optional">(optional)</span></span>
		<input bind:value={fieldName} maxlength={NAME_MAX_LENGTH} placeholder="e.g. Kitchen length" autocomplete="off" />
	</label>
	{#if localError || error}<p class="error">{localError || error}</p>{/if}
	{#snippet footer(close)}
		{#if mode === 'edit'}
			<button type="button" class="danger" disabled={busy} onclick={ondelete}>Delete</button>
		{/if}
		<span class="spacer"></span>
		<button type="button" onclick={close}>Cancel</button>
		<button type="submit" class="primary" disabled={busy}>Save</button>
	{/snippet}
</Modal>

<style>
	.keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.keys button {
		min-width: 3rem;
		padding: 0.5rem 0.9rem;
		font-weight: 600;
	}
	.optional {
		font-weight: normal;
		color: var(--text-muted);
	}
</style>
