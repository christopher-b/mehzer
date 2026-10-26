<script lang="ts">
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import FileText from '@lucide/svelte/icons/file-text';
	import Pencil from '@lucide/svelte/icons/pencil';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import { enhance } from '$app/forms';
	import { submitWith } from '#lib/client/enhance.ts';
	import { projectEdit } from '#lib/client/projectEdit.svelte.ts';
	import { projectShare } from '#lib/client/projectShare.svelte.ts';
	import PopupMenu from '#lib/components/ui/PopupMenu.svelte';
	import { unitLabel, type UnitSystem } from '#lib/units.ts';

	let {
		project,
		access
	}: {
		project: { id: string; name: string; unitSystem: UnitSystem };
		access?: { role: 'owner' | 'guest'; ownerName: string | null };
	} = $props();
</script>

<PopupMenu label="Project menu" align="left">
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
				close();
				projectEdit.editing = true;
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
					close();
					projectShare.open = true;
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
					confirm: () => confirm(`Leave "${project.name}"? You will no longer see it unless the owner shares it with you again.`)
				})}
			>
				<button type="submit" role="menuitem" class="item"><UserMinus size={18} />Leave project</button>
			</form>
		{/if}
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
