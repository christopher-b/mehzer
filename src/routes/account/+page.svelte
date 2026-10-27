<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { submitWith } from '#lib/client/enhance.ts';
	import { addPasskey, browserSupportsWebAuthn } from '#lib/client/passkeys.ts';
	import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '#lib/constants.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	let supported = $state(false);
	let adding = $state(false);
	let newName = $state('');
	let passkeyMessage = $state('');
	onMount(() => (supported = browserSupportsWebAuthn()));

	async function add() {
		adding = true;
		passkeyMessage = '';
		const result = await addPasskey(newName.trim());
		if (result.ok) {
			newName = '';
			passkeyMessage = 'Passkey added.';
			await invalidateAll();
		} else passkeyMessage = result.error;
		adding = false;
	}
</script>

<svelte:head><title>Account · Mehzur</title></svelte:head>

<h1>Your account</h1>
<p class="muted">{data.account.email}</p>

<section class="card">
	<h2>Email address</h2>
	<form method="POST" action="?/email" use:enhance={submitWith({ reset: true })} class="stack">
		<label>New email address <input type="email" name="email" autocomplete="email" required /></label>
		<label>Current password <input type="password" name="current" autocomplete="current-password" required /></label>
		<button type="submit">{data.emailConfirmation ? 'Send a confirmation link' : 'Change email address'}</button>
	</form>
	{#if data.emailConfirmation}
		<p class="muted">We email a link to the new address; the change happens when you open it. Your email stays as it is until then.</p>
	{/if}
	<FormError message={form?.emailError} />
	<p class="ok" role="status">{#if form?.emailSentTo}We sent a link to {form.emailSentTo}. Open it to finish (it works for 1 hour).{/if}</p>
	<p class="ok" role="status">{#if form?.emailChanged}Your email address is now {form.emailChanged}. Your other devices were signed out.{/if}</p>
</section>

<section class="card">
	<h2>Name</h2>
	<form method="POST" action="?/profile" use:enhance={submitWith({ reset: false })} class="row">
		<input name="name" value={data.account.name} maxlength={NAME_MAX_LENGTH} aria-label="Name" required />
		<button type="submit">Save name</button>
	</form>
	<FormError message={form?.profileError} />
	<p class="ok" role="status">{#if form?.profileSaved}Saved.{/if}</p>
</section>

<section class="card">
	<h2>Password</h2>
	<form method="POST" action="?/password" use:enhance={submitWith({ reset: true })} class="stack">
		<label>Current password <input type="password" name="current" autocomplete="current-password" required /></label>
		<label>
			New password
			<input type="password" name="password" minlength={PASSWORD_MIN_LENGTH} autocomplete="new-password" required />
		</label>
		<label>
			Repeat the new password
			<input type="password" name="confirm" minlength={PASSWORD_MIN_LENGTH} autocomplete="new-password" required />
		</label>
		<button type="submit">Change password</button>
	</form>
	<FormError message={form?.passwordError} />
	<p class="ok" role="status">{#if form?.passwordSaved}Password changed. Your other devices were signed out.{/if}</p>
</section>

{#if data.passkeysAvailable}
	<section class="card" aria-labelledby="passkeys-heading">
		<h2 id="passkeys-heading">Passkeys</h2>
		<p class="muted">
			A passkey signs you in with your fingerprint, face or device PIN instead of typing a password. Your password keeps working.
		</p>
		{#if data.passkeys.length > 0}
			<ul class="passkeys">
				{#each data.passkeys as passkey (passkey.id)}
					<li>
						<form method="POST" action="?/renamePasskey" use:enhance={submitWith({ reset: false })} class="row">
							<input type="hidden" name="id" value={passkey.id} />
							<input name="name" value={passkey.name} maxlength={NAME_MAX_LENGTH} aria-label="Name of passkey {passkey.name}" />
							<button type="submit">Rename</button>
						</form>
						<span class="muted">
							Added {day.format(passkey.createdAt)}{passkey.lastUsedAt ? ` · last used ${day.format(passkey.lastUsedAt)}` : ' · never used'}
						</span>
						<form
							method="POST"
							action="?/removePasskey"
							use:enhance={submitWith({
								confirm: () => confirm(`Remove the passkey "${passkey.name}"? You can still sign in with your password.`)
							})}
						>
							<input type="hidden" name="id" value={passkey.id} />
							<button type="submit" class="danger" aria-label="Remove passkey {passkey.name}">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">You have no passkeys yet.</p>
		{/if}
		{#if supported}
			<form
				class="row"
				onsubmit={(event) => {
					event.preventDefault();
					add();
				}}
			>
				<input bind:value={newName} maxlength={NAME_MAX_LENGTH} placeholder="Name, for example “Phone”" aria-label="Name for the new passkey" />
				<button type="submit" disabled={adding}>Add a passkey</button>
			</form>
		{:else}
			<p class="muted">This browser cannot create passkeys.</p>
		{/if}
		<p class="ok" role="status">{#if passkeyMessage}{passkeyMessage}{/if}</p>
		<FormError message={form?.passkeyError} />
		<p class="ok" role="status">{#if form?.passkeyRemoved}Passkey removed.{/if}</p>
		<p class="ok" role="status">{#if form?.passkeySaved}Saved.{/if}</p>
	</section>
{/if}

<section class="card">
	<h2>Other devices</h2>
	<form method="POST" action="?/signOutOthers" use:enhance={submitWith()}>
		<button type="submit">Sign out everywhere else</button>
	</form>
	<p class="ok" role="status">{#if form?.signedOutOthers}Signed out of your other devices.{/if}</p>
</section>

{#if data.account.role !== 'admin'}
	<section class="card danger-zone">
		<h2>Delete your account</h2>
		<p>
			This permanently deletes your account and <strong>all your projects, photos and measurements</strong>, including
			projects you have shared (other people lose access to them). Projects other people shared with you are not deleted. It
			cannot be undone.
		</p>
		<form method="POST" action="?/deleteAccount" class="stack">
			<label>Type your email address to confirm <input name="confirmEmail" autocomplete="off" required /></label>
			<label>Current password <input type="password" name="current" autocomplete="current-password" required /></label>
			<button type="submit" class="danger">Delete my account and everything in it</button>
		</form>
		<FormError message={form?.deleteError} />
	</section>
{/if}

<style>
	.muted {
		color: var(--text-muted);
	}
	.card {
		max-width: 32rem;
		margin: 1rem 0;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.card h2 {
		margin: 0 0 0.6rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	.row input {
		flex: 1;
		min-width: 0;
	}
	.row button {
		white-space: nowrap;
	}
	.passkeys {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		display: grid;
		gap: 0.9rem;
	}
	.passkeys li {
		display: grid;
		gap: 0.35rem;
	}
	.passkeys li form:last-child {
		justify-self: start;
	}
	.stack {
		display: grid;
		gap: 0.6rem;
	}
	label {
		display: grid;
		gap: 0.25rem;
	}
	.ok {
		color: var(--text-muted);
	}
	.danger-zone {
		border-color: var(--danger-border);
	}
</style>
