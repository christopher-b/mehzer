<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import wordmark from '../art/wordmark.svg';
	import { page } from '$app/state';
	import { notify } from '#lib/client/notify.svelte.ts';
	import { online } from '#lib/client/online.svelte.ts';
	import CircleUser from '@lucide/svelte/icons/circle-user';
	import LogOut from '@lucide/svelte/icons/log-out';
	import User from '@lucide/svelte/icons/user';
	import Users from '@lucide/svelte/icons/users';
	import ProjectMenu from '#lib/components/ProjectMenu.svelte';
	import PopupMenu from '#lib/components/ui/PopupMenu.svelte';
	import SessionExpired from '#lib/components/ui/SessionExpired.svelte';
	import Notifications from '#lib/components/ui/Notifications.svelte';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// SvelteKit sends the HTML first and attaches the click handlers a moment later. This marker
	// tells the browser tests (tests/e2e) that the page is ready to be clicked.
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
		return online.init((isOnline) => {
			if (isOnline) notify({ kind: 'success', message: 'Back online' });
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if page.url.pathname !== '/login'}
	<header>
		<a href="/" class="brand"><img src={wordmark} alt="Mehzur" /></a>
		{#if page.data.project}
			<span class="sep" aria-hidden="true">/</span>
			<h1 class="project-title">
				<a
					href="/p/{page.data.project.id}"
					aria-current={page.url.pathname === `/p/${page.data.project.id}` ? 'page' : undefined}
				>
					{page.data.project.name}
				</a>
			</h1>
			{#if page.url.pathname === `/p/${page.data.project.id}`}
				<ProjectMenu project={page.data.project} access={page.data.access} />
			{/if}
		{/if}
		<span class="spacer"></span>
		{#if page.data.user}
			<PopupMenu label="Account menu" wide>
				{#snippet trigger(props)}
					<button type="button" class="icon-button" aria-label="Account menu" title={page.data.user?.name} {...props}>
						<CircleUser size={22} />
					</button>
				{/snippet}
				{#snippet children(close)}
					<p role="none" class="menu-note"><strong>{page.data.user?.name}</strong><br />{page.data.user?.email}</p>
					<a role="menuitem" class="item" href="/account" onclick={() => close()}><User size={18} />Account</a>
					{#if page.data.user?.role === 'admin'}
						<a role="menuitem" class="item" href="/admin/users" onclick={() => close()}><Users size={18} />Users</a>
					{/if}
					<form method="POST" action="/logout">
						<button type="submit" role="menuitem" class="item"><LogOut size={18} />Sign out</button>
					</form>
				{/snippet}
			</PopupMenu>
		{/if}
	</header>
{/if}

{#if !online.value}
	<div class="offline" role="status">You're offline. Changes won't be saved until you reconnect.</div>
{/if}

<main>
	{@render children()}
</main>

<SessionExpired />
<Notifications />

<style>
	/* Always as tall as when the project menu button (2.25rem) is showing, so the page does not jump. */
	header {
		display: flex;
		align-items: center;
		min-height: calc(2.25rem + 1.5rem + 1px);
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	header form {
		flex: none;
		margin: 0;
	}
	header button {
		white-space: nowrap;
	}
	header :global(.popup-root) {
		flex: none;
	}
	.sep {
		color: var(--separator);
	}
	/* The project name sits beside the site title; long names shorten with an ellipsis. */
	.project-title {
		min-width: 0;
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}
	.project-title a {
		display: block;
		overflow: hidden;
		color: inherit;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	header :global(.menu-note) {
		margin: 0;
		padding: 0.5rem 0.75rem;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		overflow-wrap: anywhere;
	}
	.brand {
		display: block;
		flex: none;
	}
	.brand img {
		display: block;
		height: 1.5rem;
		width: auto;
	}
	.offline {
		padding: 0.4rem 1rem;
		background: var(--text);
		color: white;
		font-size: 0.95rem;
		text-align: center;
	}
	main {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
