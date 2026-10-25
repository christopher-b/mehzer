<script lang="ts">
	import { enhance } from '$app/forms';
	import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '#lib/constants.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Account · Mehzur</title></svelte:head>

<h2>Your account</h2>
<p class="muted">{data.account.email}</p>

<section class="card">
	<h3>Name</h3>
	<form method="POST" action="?/profile" use:enhance class="row">
		<input name="name" value={data.account.name} maxlength={NAME_MAX_LENGTH} aria-label="Name" required />
		<button type="submit">Save name</button>
	</form>
	{#if form?.profileError}<p class="error">{form.profileError}</p>{/if}
	{#if form?.profileSaved}<p class="ok" role="status">Saved.</p>{/if}
</section>

<section class="card">
	<h3>Password</h3>
	<form method="POST" action="?/password" use:enhance={() => async ({ update }) => update({ reset: true })} class="stack">
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
	{#if form?.passwordError}<p class="error">{form.passwordError}</p>{/if}
	{#if form?.passwordSaved}<p class="ok" role="status">Password changed. Your other devices were signed out.</p>{/if}
</section>

<section class="card">
	<h3>Other devices</h3>
	<form method="POST" action="?/signOutOthers" use:enhance>
		<button type="submit">Sign out everywhere else</button>
	</form>
	{#if form?.signedOutOthers}<p class="ok" role="status">Signed out of your other devices.</p>{/if}
</section>

{#if data.account.role !== 'admin'}
	<section class="card danger-zone">
		<h3>Delete your account</h3>
		<p>
			This permanently deletes your account and <strong>all your projects, photos and measurements</strong>. It cannot be
			undone.
		</p>
		<form method="POST" action="?/deleteAccount" class="stack">
			<label>Type your email address to confirm <input name="confirmEmail" autocomplete="off" required /></label>
			<label>Current password <input type="password" name="current" autocomplete="current-password" required /></label>
			<button type="submit" class="danger">Delete my account and everything in it</button>
		</form>
		{#if form?.deleteError}<p class="error">{form.deleteError}</p>{/if}
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
	.card h3 {
		margin: 0 0 0.6rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	.row input {
		flex: 1;
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
