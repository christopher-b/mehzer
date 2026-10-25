<script lang="ts">
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
		<span class="plus" aria-hidden="true">+</span>
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
	{@const { mode, children, ...rest } = props}
	<button type="button" class="tile action" {...rest}>{@render children()}</button>
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
		font-size: 3rem;
		font-weight: 300;
		line-height: 1;
	}
	.action {
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
