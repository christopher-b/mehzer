<script lang="ts">
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import FileText from '@lucide/svelte/icons/file-text';
	import Pencil from '@lucide/svelte/icons/pencil';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import { enhance } from '$app/forms';
	import { submitWith } from '#lib/client/enhance.ts';
	import ProjectEditDialog from '#lib/components/ProjectEditDialog.svelte';
	import ProjectShareDialog from '#lib/components/ProjectShareDialog.svelte';
	import PopupMenu from '#lib/components/ui/PopupMenu.svelte';
	import type { Guest } from '#lib/types.ts';
	import { unitLabel, type UnitSystem } from '#lib/units.ts';

	/**
	 * The menu button for one project (header of the project page, each row of the project list). It
	 * brings its own edit and share dialogs, so the page it sits on needs nothing else.
	 */
	let {
		project,
		access,
		guests = [],
		label = 'Project menu',
		align = 'left'
	}: {
		project: { id: string; name: string; unitSystem: UnitSystem };
		access?: { role: 'owner' | 'guest'; ownerName: string | null };
		/** Who the project is shared with; only the owner gets (and needs) the list. */
		guests?: Guest[];
		label?: string;
		align?: 'left' | 'right';
	} = $props();

	let editing = $state(false);
	let sharing = $state(false);
</script>

<PopupMenu {label} {align}>
	{#snippet children(close)}
		<p role="none" class="menu-note">
			Units: {unitLabel(project.unitSystem)}
			{#if access?.role === 'guest'}<br />Shared by {access.ownerName ?? 'a deleted user'}{/if}
		</p>
		<button
			type="button"
			role="menuitem"
			class="item"
			onclick={() => {
				close(true);
				editing = true;
			}}
		>
			<Pencil size={18} />Edit project
		</button>
		{#if access?.role === 'owner'}
			<button
				type="button"
				role="menuitem"
				class="item"
				onclick={() => {
					close(true);
					sharing = true;
				}}
			>
				<UserPlus size={18} />Share
			</button>
		{/if}
		<a role="menuitem" class="item" href="/p/{project.id}/export.csv" data-sveltekit-reload onclick={() => close()}>
			<FileSpreadsheet size={18} />Export CSV
		</a>
		<a role="menuitem" class="item" href="/p/{project.id}/export.pdf" data-sveltekit-reload onclick={() => close()}>
			<FileText size={18} />Export PDF
		</a>
		{#if access?.role === 'guest'}
			<form
				method="POST"
				action="/p/{project.id}?/leave"
				use:enhance={submitWith({
					navigate: false,
					confirm: () => confirm(`Leave "${project.name}"? You will no longer see it unless the owner shares it with you again.`)
				})}
			>
				<button type="submit" role="menuitem" class="item"><UserMinus size={18} />Leave project</button>
			</form>
		{/if}
	{/snippet}
</PopupMenu>

<ProjectEditDialog bind:open={editing} {project} canDelete={access?.role === 'owner'} />
{#if access?.role === 'owner'}<ProjectShareDialog bind:open={sharing} {project} {guests} />{/if}
