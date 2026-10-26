<script lang="ts">
	import { formatArea, unitLabel } from '#lib/units.ts';
	import AddProject from './AddProject.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Projects · Mehzur</title></svelte:head>

<h1>Projects</h1>

{#snippet summary(project: PageProps['data']['projects'][number])}
	<a href="/p/{project.id}">
		<strong>{project.name}</strong>
		<span>
			{#if !project.owned}Shared by {project.ownerName ?? 'a deleted user'} ·{/if}
			{project.photoCount}
			{project.photoCount === 1 ? 'photo' : 'photos'} ·
			{project.roomCount}
			{project.roomCount === 1 ? 'room' : 'rooms'}
			{#if project.totalAreaMm2 !== null}
				· {formatArea(project.totalAreaMm2, project.unitSystem)} total
				{#if project.measuredRoomCount < project.roomCount}
					({project.measuredRoomCount} of {project.roomCount} rooms measured)
				{/if}
			{/if}
			· {unitLabel(project.unitSystem)}
		</span>
	</a>
{/snippet}

{#if data.projects.length === 0}
	<p class="empty">No projects yet. Add one for each house you're measuring.</p>
{:else}
	<ul class="projects">
		{#each data.projects as project (project.id)}
			<li>{@render summary(project)}</li>
		{/each}
	</ul>
{/if}

<AddProject />

{#if data.shared.length > 0}
	<h2>Shared with me</h2>
	<ul class="projects">
		{#each data.shared as project (project.id)}
			<li>{@render summary(project)}</li>
		{/each}
	</ul>
{/if}

<style>
	.projects {
		list-style: none;
		padding: 0;
		margin: 1.5rem 0 0;
		display: grid;
		gap: 0.5rem;
	}
	.projects a {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: inherit;
		text-decoration: none;
	}
	.projects a:hover {
		border-color: var(--accent);
	}
	h2 {
		margin: 1.75rem 0 0;
		font-size: 1.2rem;
	}
	h2 + .projects {
		margin-top: 0.75rem;
	}
	.projects span {
		color: var(--text-muted);
		text-align: right;
	}
</style>
