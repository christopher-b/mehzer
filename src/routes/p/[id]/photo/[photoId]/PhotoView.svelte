<script lang="ts">
	import { enhance } from '$app/forms';
	import DoorOpen from '@lucide/svelte/icons/door-open';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import AnnotationCanvas, { type Line } from '#lib/components/AnnotationCanvas.svelte';
	import PopupMenu, { anyPopupOpen } from '#lib/components/ui/PopupMenu.svelte';
	import { postAction } from '#lib/client/actions.ts';
	import { submitWith } from '#lib/client/enhance.ts';
	import { saveDraft, takeDraft } from '#lib/client/drafts.ts';
	import { reportSession } from '#lib/client/session.svelte.ts';
	import { messageFor } from '#lib/client/errors.ts';
	import { notify } from '#lib/client/notify.svelte.ts';
	import { canvasLabel } from '#lib/measurements.ts';
	import { formatLength } from '#lib/units.ts';
	import ChangeRoomDialog from './ChangeRoomDialog.svelte';
	import MeasurementDialog from './MeasurementDialog.svelte';
	import MeasurementList from './MeasurementList.svelte';
	import PhotoNav from './PhotoNav.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const unitSystem = $derived(data.project.unitSystem);
	const currentRoomName = $derived(
		data.rooms.find((r) => r.id === data.photo.roomId)?.name ?? 'No room'
	);

	let canvas: ReturnType<typeof AnnotationCanvas>;
	let roomDialogOpen = $state(false);
	let roomError = $state('');

	let selectedId = $state<string | null>(page.url.searchParams.get('select'));
	let pendingPoint = $state(false);
	let busy = $state(false);

	/** Coordinates saved by a drag, shown until the reload brings them back from the server. */
	let movedLines = $state<Record<string, Line>>({});

	type DialogState =
		| { mode: 'create'; line: Line }
		| { mode: 'edit'; id: string };
	/** The measurement dialog is open exactly when this is set. */
	let dialogState = $state<DialogState | null>(null);
	let dialogInitial = $state({ name: '', value: '' });
	let dialogError = $state('');

	const canvasAnnotations = $derived(
		data.annotations.map((a) => ({ ...a, ...movedLines[a.id], label: canvasLabel(a, unitSystem) }))
	);

	function openDialog(state: DialogState) {
		if (state.mode === 'create') {
			dialogInitial = { name: '', value: '' };
		} else {
			const a = data.annotations.find((x) => x.id === state.id);
			if (!a) return;
			dialogInitial = {
				name: a.name ?? '',
				value: a.valueMm === null ? '' : formatLength(a.valueMm, unitSystem)
			};
		}
		dialogError = '';
		dialogState = state;
	}

	async function saveMeasurement(fields: { name: string; value: string }) {
		if (!dialogState || busy) return;
		const state = dialogState;
		busy = true;
		dialogError = '';
		try {
			if (state.mode === 'create') {
				const result = await postAction('create', { ...state.line, ...fields });
				selectedId = (result?.id as string) ?? null;
			} else {
				await postAction('update', { id: state.id, ...fields });
			}
			dialogState = null;
		} catch (err) {
			dialogError = messageFor(err);
			if (reportSession(err)) {
				saveDraft(
					state.mode === 'create'
						? { kind: 'measurement', mode: 'create', line: state.line, ...fields }
						: { kind: 'measurement', mode: 'edit', id: state.id, ...fields }
				);
			}
		} finally {
			busy = false;
		}
	}

	async function deleteAnnotation(id: string) {
		const a = data.annotations.find((x) => x.id === id);
		if (!a || !confirm(`Delete ${a.name ? `"${a.name}"` : 'this measurement'}?`)) return;
		busy = true;
		try {
			await postAction('delete', { id });
			if (selectedId === id) selectedId = null;
			if (dialogState?.mode === 'edit' && dialogState.id === id) dialogState = null;
		} catch (err) {
			if (reportSession(err)) return;
			// a native modal covers notifications, so a failure from inside the dialog stays in it
			if (dialogState) dialogError = messageFor(err);
			else notify({ kind: 'error', message: messageFor(err) });
		} finally {
			busy = false;
		}
	}

	async function saveRoom(roomId: string) {
		if (busy) return;
		busy = true;
		roomError = '';
		try {
			if (roomId !== (data.photo.roomId ?? '')) await postAction('setRoom', { roomId });
			roomDialogOpen = false;
		} catch (err) {
			roomError = messageFor(err);
			reportSession(err);
		} finally {
			busy = false;
		}
	}

	async function moveAnnotation(id: string, line: Line, retry = false) {
		movedLines[id] = line;
		try {
			await postAction('move', { id, ...line });
			if (retry) notify({ kind: 'success', message: 'Saved' });
		} catch (err) {
			if (reportSession(err)) return;
			notify({
				kind: 'error',
				message: `Couldn't save the new position. ${messageFor(err)}`,
				action: { label: 'Retry', run: () => moveAnnotation(id, line, true) }
			});
		} finally {
			delete movedLines[id];
		}
	}

	// Back from signing in again: put the measurement that was being typed back in its dialog.
	onMount(() => {
		const draft = takeDraft();
		if (draft?.kind !== 'measurement') return;
		if (draft.mode === 'create') openDialog({ mode: 'create', line: draft.line });
		else openDialog({ mode: 'edit', id: draft.id });
		if (dialogState) dialogInitial = { name: draft.name, value: draft.value };
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.defaultPrevented) return;
		const modalOpen = dialogState || roomDialogOpen || anyPopupOpen();
		if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)) {
			if (modalOpen || pendingPoint) return;
			if ((e.target as HTMLElement).closest('input, textarea, select')) return;
			const neighbour = e.key === 'ArrowLeft' ? data.neighbours.previous : data.neighbours.next;
			if (neighbour) {
				e.preventDefault();
				goto(`/p/${data.project.id}/photo/${neighbour.id}`);
			}
			return;
		}
		if (modalOpen || !selectedId) return;
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select')) return;
		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			deleteAnnotation(selectedId);
		} else if (e.key === 'Enter') {
			openDialog({ mode: 'edit', id: selectedId });
		} else if (e.key === 'Escape') {
			selectedId = null;
		}
	}

	const hint = $derived(
		pendingPoint
			? 'Tap the second point. Esc to cancel.'
			: selectedId
				? 'Drag the blue handles to adjust. Tap the photo to deselect.'
				: 'Tap two points on the photo to add a measurement.'
	);
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:head>
	<title>Photo · {data.project.name} · Mehzur</title>
	{#each [data.neighbours.previous, data.neighbours.next] as neighbour}
		{#if neighbour}<link rel="prefetch" href="/api/photos/{neighbour.blobKey}" />{/if}
	{/each}
</svelte:head>

<a class="back" href="/p/{data.project.id}">← Back to {data.project.name}</a>

<div class="layout">
	<div class="stage">
		<div class="hint">
			<span>{hint}</span>
			{#if pendingPoint}<button type="button" onclick={() => canvas.cancel()}>Cancel</button>{/if}
		</div>
		<div class="room-row">
			<span>Room: <strong>{currentRoomName}</strong></span>
			<span class="spacer"></span>
			<PopupMenu label="Photo menu">
				{#snippet children(close)}
					<button
						type="button"
						role="menuitem"
						class="item"
						onclick={() => {
							close();
							roomError = '';
							roomDialogOpen = true;
						}}
					>
						<DoorOpen size={18} />Change room
					</button>
					<form
						method="POST"
						action="?/deletePhoto"
						use:enhance={submitWith({
							before: close,
							confirm: () => confirm('Delete this photo and its measurements?')
						})}
					>
						<button type="submit" role="menuitem" class="item danger-item"><Trash2 size={18} />Delete photo</button>
					</form>
				{/snippet}
			</PopupMenu>
		</div>
		<AnnotationCanvas
			bind:this={canvas}
			src="/api/photos/{data.photo.blobKey}"
			alt={data.photo.caption ?? 'Photo'}
			width={data.photo.width}
			height={data.photo.height}
			annotations={canvasAnnotations}
			{selectedId}
			draft={dialogState?.mode === 'create' ? dialogState.line : null}
			interactive={!dialogState}
			onselect={(id) => (selectedId = id)}
			oncreate={(line) => {
				selectedId = null;
				openDialog({ mode: 'create', line });
			}}
			onmove={moveAnnotation}
			onpending={(p) => (pendingPoint = p)}
		/>
		{#if data.neighbours.total > 1}
			<PhotoNav projectId={data.project.id} roomName={currentRoomName} neighbours={data.neighbours} />
		{/if}
	</div>

	<MeasurementList
		annotations={data.annotations}
		{selectedId}
		{unitSystem}
		{busy}
		onselect={(id) => (selectedId = selectedId === id ? null : id)}
		onedit={(id) => openDialog({ mode: 'edit', id })}
		ondelete={deleteAnnotation}
	/>
</div>

<MeasurementDialog
	bind:open={() => dialogState !== null, (open) => { if (!open) dialogState = null; }}
	mode={dialogState?.mode ?? 'create'}
	initial={dialogInitial}
	{unitSystem}
	{busy}
	error={dialogError}
	onsave={saveMeasurement}
	ondelete={() => dialogState?.mode === 'edit' && deleteAnnotation(dialogState.id)}
/>

<ChangeRoomDialog
	bind:open={roomDialogOpen}
	rooms={data.rooms}
	currentRoomId={data.photo.roomId}
	{busy}
	error={roomError}
	onsave={saveRoom}
/>

<style>
	.back {
		display: flex;
		align-items: center;
		width: 100%;
		min-height: 3rem;
		margin-bottom: 0.75rem;
		padding: 0.6rem 1rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: inherit;
		font-size: 1.05rem;
		font-weight: 600;
		text-decoration: none;
	}
	.back:hover {
		border-color: var(--accent);
	}
	@media (min-width: 900px) {
		.back {
			width: auto;
			display: inline-flex;
		}
	}
	.layout {
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 18rem;
			align-items: start;
		}
	}
	.hint {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.25rem;
		margin-bottom: 0.5rem;
		color: var(--text-secondary);
	}
	.room-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.5rem;
	}
</style>
