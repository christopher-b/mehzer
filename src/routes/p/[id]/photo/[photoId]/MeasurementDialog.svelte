<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
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
	const unreadable = $derived(fieldValue.trim() !== '' && parsedValue === null);
	/** The symbols have no sensible spoken name, so those keys are labelled. */
	const keys = $derived<{ text: string; label?: string }[]>(
		unitSystem === 'imperial'
			? [
					{ text: "'", label: 'feet' },
					{ text: '"', label: 'inches' }
				]
			: [{ text: 'm' }, { text: 'cm' }, { text: 'mm' }]
	);
	const uid = $props.id();
	const hintId = `${uid}-hint`;

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
	<div class="field">
		<label>
			Measurement
			<input
				bind:this={valueInput}
				bind:value={fieldValue}
				placeholder={lengthPlaceholder(unitSystem)}
				autocomplete="off"
				inputmode={fullKeyboard ? 'text' : 'decimal'}
				aria-describedby={hintId}
				aria-invalid={unreadable}
			/>
		</label>
		<small id={hintId} class:error={unreadable} aria-live="polite">
			{#if !fieldValue.trim()}
				Optional. Leave blank to fill in later.
			{:else if parsedValue === null}
				Not recognised
			{:else}
				= {formatLength(parsedValue, unitSystem)}
			{/if}
		</small>
	</div>
	<div class="keys">
		{#each keys as { text, label } (text)}
			<button type="button" aria-label={label} onpointerdown={(e) => e.preventDefault()} onclick={() => insertText(text)}>
				{text}
			</button>
		{/each}
		<span class="spacer"></span>
		<button
			type="button"
			aria-pressed={fullKeyboard}
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
	<FormError message={localError || error} />
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
	.field {
		display: grid;
		gap: 0.3rem;
	}
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
