<script lang="ts">
	import { untrack, type Snippet } from 'svelte';

	/**
	 * A native modal `<dialog>` with a title; the content is up to the caller (`Modal` adds a form,
	 * the project edit and share dialogs bring their own). `open` is reset the moment the dialog is
	 * closed by any means (Cancel, Escape, the form), not when the browser's `close` event arrives a
	 * moment later: until then the page would still think a dialog is open and ignore taps on the photo.
	 */
	let {
		open = $bindable(false),
		title,
		onopen,
		onclose,
		children
	}: {
		open?: boolean;
		title: string;
		onopen?: () => void;
		onclose?: () => void;
		children: Snippet<[() => void]>;
	} = $props();

	const titleId = $props.id();
	let dialog: HTMLDialogElement;

	$effect(() => {
		if (open && !dialog.open) {
			dialog.showModal();
			untrack(() => onopen?.());
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	function markClosed() {
		if (!open) return;
		open = false;
		onclose?.();
	}

	/**
	 * The native `close` event arrives a moment after the dialog closes. If the dialog has been opened
	 * again by then, the event is stale and must not close the new one.
	 */
	function onNativeClose() {
		if (!dialog.open) markClosed();
	}

	function close() {
		markClosed();
		if (dialog.open) dialog.close();
	}
</script>

<!-- `cancel` is Escape; it is followed by `close`, which then has nothing left to do. -->
<dialog bind:this={dialog} aria-labelledby={titleId} oncancel={markClosed} onclose={onNativeClose}>
	<h2 id={titleId}>{title}</h2>
	{@render children(close)}
</dialog>

<style>
	/* Modal dialogs sit at the top with a margin rather than in the vertical centre, so they stay
	   visible above a phone's on-screen keyboard. */
	dialog {
		margin: 1rem auto auto;
		max-height: calc(100dvh - 2rem);
		overflow: auto;
		width: min(26rem, calc(100vw - 2rem));
		border: none;
		border-radius: var(--radius-xl);
		padding: 1.25rem;
		box-shadow: var(--shadow-dialog);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	h2 {
		margin: 0 0 1rem;
		font-size: 1.2rem;
	}
</style>
