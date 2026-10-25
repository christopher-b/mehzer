<script lang="ts">
	import { statusLabel } from '#lib/client/upload-state.ts';
	import type { UploadQueue } from '#lib/client/uploads.svelte.ts';

	let { uploads }: { uploads: UploadQueue } = $props();
</script>

{#if uploads.items.length}
	<div class="uploads">
		<ul>
			{#each uploads.items as item (item.id)}
				<li>
					<span class="name">{item.name}</span>
					<progress aria-label="Upload progress for {item.name}" max="100" value={Math.round(item.progress * 100)}></progress>
					<span class="status" class:error={item.status === 'failed'}>{statusLabel(item)}</span>
					{#if item.retryable && (item.status === 'failed' || item.status === 'not-uploaded')}
						<button type="button" aria-label="Retry {item.name}" onclick={() => uploads.retry(item.id)}>Retry</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if !uploads.busy}
			<button type="button" aria-label="Dismiss upload list" onclick={() => uploads.dismiss()}>Dismiss</button>
		{/if}
	</div>
{/if}

<style>
	.uploads {
		display: grid;
		gap: 0.5rem;
		justify-items: start;
		margin: 0 0 1rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
		width: 100%;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}
	.name {
		flex: 1 1 10rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	progress {
		flex: 0 1 8rem;
	}
	.status {
		color: var(--text-secondary);
	}
	.status.error {
		color: var(--danger);
	}
</style>
