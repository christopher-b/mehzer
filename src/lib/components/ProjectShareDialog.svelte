<script lang="ts">
	import { enhance } from '$app/forms';
	import { failureMessage } from '#lib/client/actions.ts';
	import { submitWith } from '#lib/client/enhance.ts';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import type { Guest } from '#lib/server/sharing.ts';

	let {
		open = $bindable(false),
		project,
		guests
	}: {
		open?: boolean;
		project: { id: string };
		guests: Guest[];
	} = $props();

	let error = $state('');
	let email = $state('');
	const action = (name: string) => `/p/${project.id}?/${name}`;
</script>

<Dialog bind:open title="Share this project" onopen={() => ((error = ''), (email = ''))}>
	{#snippet children(close)}
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
							action={action('handOver')}
							use:enhance={submitWith({
								navigate: false,
								before: () => (error = ''),
								onError: (message) => (error = message),
								confirm: () =>
									confirm(
										`Hand this project over to ${guest.name}? They become the owner. You stay on it as a guest and can no longer delete it or share it.`
									)
							})}
						>
							<input type="hidden" name="userId" value={guest.userId} />
							<button type="submit" aria-label="Hand over to {guest.name}">Hand over</button>
						</form>
						<form
							method="POST"
							action={action('unshare')}
							use:enhance={submitWith({ navigate: false, before: () => (error = ''), onError: (message) => (error = message) })}
						>
							<input type="hidden" name="userId" value={guest.userId} />
							<button type="submit" aria-label="Stop sharing with {guest.name}">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="POST"
			action={action('share')}
			class="add"
			use:enhance={submitWith({
				navigate: false,
				before: () => (error = ''),
				onFailure: (result) => (error = failureMessage(result, 'Could not share the project')),
				onError: (message) => (error = message)
			})}
		>
			<input
				type="email"
				name="email"
				bind:value={email}
				aria-label="Email address"
				placeholder="Their email address"
				autocomplete="off"
				required
			/>
			<button type="submit" class="primary">Share</button>
			<button type="button" onclick={close}>Done</button>
		</form>
		{#if error}<p class="error">{error}</p>{/if}
	{/snippet}
</Dialog>

<style>
	.note {
		margin: 0 0 0.6rem;
		color: var(--text-muted);
	}
	ul {
		list-style: none;
		margin: 0 0 0.6rem;
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
	form {
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
		margin: 0.6rem 0 0;
	}
</style>
