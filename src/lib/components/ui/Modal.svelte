<script lang="ts">
	import type { Snippet } from 'svelte';
	import Dialog from './Dialog.svelte';

	/** A modal `<dialog>` holding one form, with an optional row of buttons below it. */
	let {
		open = $bindable(false),
		title,
		onsubmit,
		onopen,
		onclose,
		children: content,
		footer
	}: {
		open?: boolean;
		title: string;
		onsubmit?: (e: SubmitEvent) => void;
		onopen?: () => void;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet<[() => void]>;
	} = $props();
</script>

<Dialog bind:open {title} {onopen} {onclose}>
	{#snippet children(close)}
		<form {onsubmit}>
			{@render content()}
			{#if footer}<div class="buttons">{@render footer(close)}</div>{/if}
		</form>
	{/snippet}
</Dialog>

<style>
	form {
		display: grid;
		gap: 0.9rem;
	}
	form :global(label) {
		display: grid;
		gap: 0.3rem;
		font-weight: 600;
	}
	form :global(small) {
		font-weight: normal;
		color: var(--text-muted);
	}
	form :global(small.error) {
		color: var(--danger);
	}
</style>
