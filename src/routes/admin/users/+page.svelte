<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:head><title>Users · Mehzur</title></svelte:head>

<h2>Users</h2>

<section class="card">
	<h3>Invite someone</h3>
	<form method="POST" action="?/invite" use:enhance class="stack">
		<label>
			Email address (optional)
			<input type="email" name="email" autocomplete="off" />
		</label>
		{#if data.emailEnabled}
			<label class="inline"><input type="checkbox" name="send" checked /> Email them the link</label>
		{/if}
		<button type="submit" class="primary">Create invite link</button>
	</form>
	{#if form?.inviteError}<p class="error">{form.inviteError}</p>{/if}
	{#if form?.inviteLink}
		<div class="link" role="status">
			<p>
				Invite link{form.inviteEmail ? ` for ${form.inviteEmail}` : ''}
				{#if form.emailed}(emailed){/if}. It works once and expires in 7 days. Copy it now: it will not be shown again.
			</p>
			<input readonly value={form.inviteLink} aria-label="Invite link" onfocus={(e) => e.currentTarget.select()} />
		</div>
	{/if}
</section>

{#if data.invites.length > 0}
	<section class="card">
		<h3>Waiting to be used</h3>
		<ul class="list">
			{#each data.invites as invite (invite.id)}
				<li>
					<span>{invite.email ?? 'Any email'} · expires {day.format(invite.expiresAt)}</span>
					<form method="POST" action="?/revoke" use:enhance>
						<input type="hidden" name="inviteId" value={invite.id} />
						<button type="submit">Revoke</button>
					</form>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="card wide">
	<h3>People</h3>
	{#if form?.userError}<p class="error">{form.userError}</p>{/if}
	{#if form?.resetLink}
		<div class="link" role="status">
			<p>Reset link for {form.resetFor}{#if form.emailed} (emailed){/if}. It works once and expires in 1 hour.</p>
			<input readonly value={form.resetLink} aria-label="Reset link" onfocus={(e) => e.currentTarget.select()} />
		</div>
	{/if}
	<ul class="list">
		{#each data.users as user (user.id)}
			<li>
				<div class="who">
					<strong>{user.name}</strong>{#if user.role === 'admin'}<span class="tag">admin</span>{/if}
					{#if user.disabled}<span class="tag off">disabled</span>{/if}
					<br /><span class="muted">{user.email} · {user.projectCount} project{user.projectCount === 1 ? '' : 's'} · joined {day.format(user.createdAt)}</span>
				</div>
				{#if user.id !== data.me}
					<div class="actions">
						<form method="POST" action="?/resetLink" use:enhance>
							<input type="hidden" name="userId" value={user.id} />
							<button type="submit">Reset link</button>
						</form>
						<form method="POST" action={user.disabled ? '?/enable' : '?/disable'} use:enhance>
							<input type="hidden" name="userId" value={user.id} />
							<button type="submit">{user.disabled ? 'Enable' : 'Disable'}</button>
						</form>
						<form method="POST" action="?/delete" use:enhance class="delete">
							<input type="hidden" name="userId" value={user.id} />
							<input name="confirmEmail" placeholder="Type email to delete" aria-label="Type the email of {user.name} to delete" />
							<button type="submit" class="danger">Delete</button>
						</form>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	<p class="muted">Deleting a person also deletes all the projects they own, with their photos and measurements, even if those are shared with others. Projects they were only a guest on are not deleted.</p>
</section>

<style>
	.card {
		max-width: 36rem;
		margin: 1rem 0;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.card.wide {
		max-width: 48rem;
	}
	.card h3 {
		margin: 0 0 0.6rem;
	}
	.stack {
		display: grid;
		gap: 0.6rem;
	}
	label {
		display: grid;
		gap: 0.25rem;
	}
	label.inline {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.list {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.actions form {
		margin: 0;
	}
	.delete {
		display: flex;
		gap: 0.3rem;
	}
	.delete input {
		width: 11rem;
	}
	.muted {
		color: var(--text-muted);
	}
	.tag {
		margin-left: 0.4rem;
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
	}
	.link input {
		width: 100%;
	}
</style>
