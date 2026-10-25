<script lang="ts">
	import { projectEdit } from '#lib/client/projectEdit.svelte.ts';
	import PopupMenu from '#lib/components/ui/PopupMenu.svelte';
	import { unitLabel, type UnitSystem } from '#lib/units.ts';

	let { project }: { project: { id: string; unitSystem: UnitSystem } } = $props();
</script>

<PopupMenu label="Project menu" align="left">
	{#snippet children(close)}
		<p role="none" class="menu-note">Units: {unitLabel(project.unitSystem)}</p>
		<button
			type="button"
			role="menuitem"
			onclick={() => {
				close();
				projectEdit.editing = true;
			}}
		>
			Edit project
		</button>
		<a role="menuitem" href="/p/{project.id}/export.csv" data-sveltekit-reload onclick={() => close()}>Export CSV</a>
		<a role="menuitem" href="/p/{project.id}/export.pdf" data-sveltekit-reload onclick={() => close()}>Export PDF</a>
	{/snippet}
</PopupMenu>

<style>
	.menu-note {
		margin: 0;
		padding: 0.5rem 0.75rem;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
	}
</style>
