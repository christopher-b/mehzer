<script lang="ts">
	import ProjectMenu from '#lib/components/ProjectMenu.svelte';
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
	<ProjectMenu
		{project}
		access={{ role: project.owned ? 'owner' : 'guest', ownerName: project.ownerName }}
		guests={project.guests}
		label="Menu for {project.name}"
		align="right"
	/>
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
	.projects li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-right: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.projects li:hover {
		border-color: var(--accent);
	}
	.projects a {
		display: flex;
		flex: 1;
		min-width: 0;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 0 0.9rem 1rem;
		color: inherit;
		text-decoration: none;
	}
	.projects li :global(.popup-root) {
		flex: none;
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
