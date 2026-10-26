<script lang="ts">
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import FileText from '@lucide/svelte/icons/file-text';
	import Pencil from '@lucide/svelte/icons/pencil';
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
			class="item"
			onclick={() => {
				close();
				projectEdit.editing = true;
			}}
		>
			<Pencil size={18} />Edit project
		</button>
		<a role="menuitem" class="item" href="/p/{project.id}/export.csv" data-sveltekit-reload onclick={() => close()}>
			<FileSpreadsheet size={18} />Export CSV
		</a>
		<a role="menuitem" class="item" href="/p/{project.id}/export.pdf" data-sveltekit-reload onclick={() => close()}>
			<FileText size={18} />Export PDF
		</a>
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
