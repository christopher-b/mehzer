<script lang="ts">
	import { enhance } from '$app/forms';
	import { submitWith } from '#lib/client/enhance.ts';
	import { NAME_MAX_LENGTH } from '#lib/constants.ts';
	import { UNIT_OPTIONS, formatArea, unitLabel } from '#lib/units.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Projects · Mehzur</title></svelte:head>

<h1>Projects</h1>

<form method="POST" action="?/create" use:enhance={submitWith()} class="create">
	<input name="name" aria-label="Project name" placeholder="New project, e.g. 12 Elm St" maxlength={NAME_MAX_LENGTH} required />
	<select name="unitSystem" aria-label="Units">
		{#each UNIT_OPTIONS as unit (unit.value)}
			<option value={unit.value}>{unit.label}</option>
		{/each}
	</select>
	<button type="submit" class="primary">Create</button>
</form>
{#if form?.error}<p class="error">{form.error}</p>{/if}

{#if data.projects.length === 0}
	<p class="empty">No projects yet. Create one for each house you're measuring.</p>
{:else}
	<ul class="projects">
		{#each data.projects as project (project.id)}
			<li>
				<a href="/p/{project.id}">
					<strong>{project.name}</strong>
					<span>
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
			</li>
		{/each}
	</ul>
{/if}

<style>
	.create {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.create input {
		flex: 1 1 14rem;
	}
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
	.projects span {
		color: var(--text-muted);
		text-align: right;
	}
</style>
