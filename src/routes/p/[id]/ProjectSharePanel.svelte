<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { failureMessage } from '#lib/client/actions.ts';
	import { submitWith } from '#lib/client/enhance.ts';
	import { projectShare } from '#lib/client/projectShare.svelte.ts';
	import type { Guest } from '#lib/server/sharing.ts';

	let { guests }: { guests: Guest[] } = $props();

	let error = $state('');

	// The panel is opened from the header's project menu; leaving the page closes it.
	onMount(() => () => (projectShare.open = false));
</script>

{#if projectShare.open}
	<section class="share" aria-label="Sharing">
		<h2>Share this project</h2>
		<p class="note">
			People you share it with can add and change photos, rooms and measurements, and rename the project. Only you can delete it,
			share it or hand it over. They need a Mehzur account already.
		</p>

		{#if guests.length === 0}
			<p class="note">Not shared with anyone yet.</p>
		{:else}
			<ul>
				{#each guests as guest (guest.userId)}
					<li>
						<span class="who"><strong>{guest.name}</strong> <small>{guest.email}</small></span>
						<form
							method="POST"
							action="?/handOver"
							use:enhance={submitWith({
								confirm: () =>
									confirm(
										`Hand this project over to ${guest.name}? They become the owner. You stay on it as a guest and can no longer delete it or share it.`
									)
							})}
						>
							<input type="hidden" name="userId" value={guest.userId} />
							<button type="submit" aria-label="Hand over to {guest.name}">Hand over</button>
						</form>
						<form method="POST" action="?/unshare" use:enhance={submitWith()}>
							<input type="hidden" name="userId" value={guest.userId} />
							<button type="submit" aria-label="Stop sharing with {guest.name}">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="POST"
			action="?/share"
			class="add"
			use:enhance={submitWith({
				before: () => (error = ''),
				onFailure: (result) => (error = failureMessage(result, 'Could not share the project')),
				onError: (message) => (error = message)
			})}
		>
			<input type="email" name="email" aria-label="Email address" placeholder="Their email address" autocomplete="off" required />
			<button type="submit" class="primary">Share</button>
			<button type="button" onclick={() => (projectShare.open = false)}>Done</button>
		</form>
		{#if error}<p class="error">{error}</p>{/if}
	</section>
{/if}

<style>
	.share {
		margin: 0.75rem 0 0.5rem;
		padding: 0.9rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		display: grid;
		gap: 0.6rem;
	}
	h2 {
		margin: 0;
		font-size: 1.1rem;
	}
	.note {
		margin: 0;
		color: var(--text-muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	li form {
		margin: 0;
	}
	.who {
		flex: 1 1 12rem;
		overflow-wrap: anywhere;
	}
	.who small {
		color: var(--text-muted);
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.add input {
		flex: 1 1 14rem;
	}
	.error {
		margin: 0;
	}
</style>
