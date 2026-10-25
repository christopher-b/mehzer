<script module lang="ts">
	/** Id of the one popup that is open on the page (only one can be open at a time). */
	let openId = $state<string | null>(null);

	export function anyPopupOpen() {
		return openId !== null;
	}
</script>

<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import HamburgerIcon from './HamburgerIcon.svelte';

	interface TriggerProps {
		'aria-expanded': boolean;
		'aria-haspopup'?: 'menu' | 'dialog';
		'aria-controls': string;
		onclick: () => void;
	}

	/**
	 * `kind`: 'menu' is a list of `role="menuitem"` buttons (arrow keys move between them); 'panel'
	 * is a plain disclosure with arbitrary content; 'dialog' is a small non-modal dialog.
	 * `label` names the trigger button (or, for 'dialog', the popup itself, since a custom `trigger`
	 * supplies its own name). Panels stay in the DOM and are only hidden, so a form inside is never
	 * unmounted while it is submitting.
	 */
	let {
		label,
		align = 'right',
		kind = 'menu',
		wide = false,
		trigger,
		onopen,
		children
	}: {
		label: string;
		align?: 'left' | 'right' | 'center';
		kind?: 'menu' | 'panel' | 'dialog';
		wide?: boolean;
		trigger?: Snippet<[TriggerProps]>;
		onopen?: () => void;
		children: Snippet<[(returnFocus?: boolean) => void]>;
	} = $props();

	const id = $props.id();
	const open = $derived(openId === id);
	let root: HTMLElement;
	let panel: HTMLElement;
	let triggerEl = $state<HTMLButtonElement>();

	function close(returnFocus = false) {
		if (openId === id) openId = null;
		if (returnFocus) (triggerEl ?? root.querySelector<HTMLElement>('button'))?.focus();
	}

	/** Open the popup from code (does nothing if it is already open). */
	export function show() {
		if (!open) toggle();
	}

	async function toggle() {
		if (open) return close();
		openId = id;
		onopen?.();
		await tick();
		const first = kind === 'menu' ? '[role="menuitem"]' : 'button, input:not([type="hidden"]), select';
		panel.querySelector<HTMLElement>(first)?.focus();
	}

	function onWindowClick(e: MouseEvent) {
		if (open && !root.contains(e.target as Node)) close();
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			close(true);
		}
	}

	function onPanelKeydown(e: KeyboardEvent) {
		if (kind !== 'menu' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
		e.preventDefault();
		const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		const at = items.indexOf(document.activeElement as HTMLElement);
		const next = e.key === 'ArrowDown' ? at + 1 : at - 1;
		items[(next + items.length) % items.length]?.focus();
	}

	const triggerProps = $derived<TriggerProps>({
		'aria-expanded': open,
		'aria-haspopup': kind === 'panel' ? undefined : kind,
		'aria-controls': id,
		onclick: toggle
	});
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="popup-root" bind:this={root}>
	{#if trigger}
		{@render trigger(triggerProps)}
	{:else}
		<button type="button" class="icon-button" aria-label={label} bind:this={triggerEl} {...triggerProps}>
			<HamburgerIcon />
		</button>
	{/if}
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div
		{id}
		bind:this={panel}
		class={kind === 'dialog' ? 'popover' : 'menu'}
		class:wide
		class:align-left={align === 'left'}
		class:align-center={align === 'center'}
		role={kind === 'menu' ? 'menu' : kind === 'dialog' ? 'dialog' : undefined}
		aria-label={kind === 'dialog' ? label : undefined}
		hidden={!open}
		onkeydown={onPanelKeydown}
	>
		{@render children(close)}
	</div>
</div>

<style>
	.align-left {
		left: 0;
		right: auto;
	}
	.align-center {
		left: 50%;
		right: auto;
		transform: translateX(-50%);
	}
	.wide {
		min-width: 17rem;
		max-width: calc(100vw - 2rem);
	}
	.popover {
		width: min(20rem, calc(100vw - 2rem));
		padding: 0.9rem;
	}
</style>
