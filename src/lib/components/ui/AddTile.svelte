<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type FileProps = {
		mode: 'file';
		accept: string;
		multiple?: boolean;
		ariaLabel: string;
		onfiles: (files: FileList) => unknown;
	};
	type ButtonProps = { mode: 'button'; children: Snippet } & HTMLButtonAttributes;

	let props: FileProps | ButtonProps = $props();

	function onchange(e: Event, onfiles: FileProps['onfiles']) {
		const input = e.currentTarget as HTMLInputElement;
		if (!input.files?.length) return;
		Promise.resolve(onfiles(input.files)).finally(() => (input.value = ''));
	}
</script>

{#if props.mode === 'file'}
	{@const file = props}
	<!-- No `capture` attribute: phones then offer "Take Photo" alongside the photo library. -->
	<label class="tile file">
		<span class="plus" aria-hidden="true"><Plus size={48} strokeWidth={1.5} /></span>
		<input
			type="file"
			accept={file.accept}
			multiple={file.multiple}
			class="visually-hidden"
			aria-label={file.ariaLabel}
			onchange={(e) => onchange(e, file.onfiles)}
		/>
	</label>
{:else}
	{@const { mode, children, onclick, ...rest } = props}
	<!-- Safari does not focus a button when it is clicked; without this a dialog opened from here
	     would have nowhere to return focus to when it closes. -->
	<button
		type="button"
		class="tile action"
		{...rest}
		onclick={(e) => {
			e.currentTarget.focus();
			(onclick as ((e: MouseEvent) => void) | undefined)?.(e);
		}}
	>
		{@render children()}
	</button>
{/if}

<style>
	.tile {
		border: 2px dashed var(--border-dashed);
		background: var(--surface-muted);
		color: var(--text-muted);
		cursor: pointer;
	}
	.tile:hover,
	.tile:focus-within {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-soft);
	}
	/* Empty photo slot with a big "+": the way to add photos to a room. */
	.file {
		display: grid;
		place-items: center;
		height: 6.5rem;
		border-radius: var(--radius-md);
	}
	.plus {
		display: grid;
	}
	.action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-width: 12rem;
		padding: 0.9rem 2.5rem;
		font-size: 1.25rem;
		font-weight: 600;
	}
	/* The accent text colour is too faint on the soft accent background for a text label. */
	.action:hover,
	.action:focus-visible {
		color: var(--text);
	}
</style>
