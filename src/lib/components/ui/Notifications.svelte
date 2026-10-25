<script lang="ts">
	import { dismiss, notifications, type Notification } from '#lib/client/notify.svelte.ts';

	const errors = $derived(notifications.items.filter((n) => n.kind === 'error'));
	const others = $derived(notifications.items.filter((n) => n.kind !== 'error'));
</script>

{#snippet item(n: Notification)}
	<div class="notification {n.kind}">
		<span class="message">{n.message}</span>
		{#if n.action}
			<button
				type="button"
				onclick={() => {
					dismiss(n.id);
					n.action?.run();
				}}>{n.action.label}</button
			>
		{/if}
		<button type="button" class="close" onclick={() => dismiss(n.id)}>Dismiss</button>
	</div>
{/snippet}

<div class="notifications">
	<div role="status" aria-live="polite">
		{#each others as n (n.id)}{@render item(n)}{/each}
	</div>
	<div role="alert">
		{#each errors as n (n.id)}{@render item(n)}{/each}
	</div>
</div>

<style>
	.notifications {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0 1rem calc(1rem + env(safe-area-inset-bottom));
		pointer-events: none;
	}
	.notifications > div {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: min(28rem, calc(100vw - 2rem));
	}
	.notification {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-menu);
		pointer-events: auto;
	}
	.notification.error {
		border-color: var(--danger-border);
		color: var(--danger);
	}
	.notification.success,
	.notification.info {
		border-color: var(--accent);
	}
	.message {
		flex: 1 1 12rem;
		min-width: 0;
	}
	.close {
		border-color: transparent;
	}
</style>
