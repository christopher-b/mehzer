<script lang="ts">
	import FormError from '#lib/components/ui/FormError.svelte';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import { CollapsedState } from '#lib/client/collapsed.svelte.ts';
	import { UploadQueue } from '#lib/client/uploads.svelte.ts';
	import { formatValue, measurementName } from '#lib/measurements.ts';
	import { formatArea } from '#lib/units.ts';
	import UploadList from './UploadList.svelte';
	import AddRoom from './AddRoom.svelte';
	import MeasurementRow from './MeasurementRow.svelte';
	import MeasurementTable from './MeasurementTable.svelte';
	import PhotoGrid from './PhotoGrid.svelte';
	import RoomCard from './RoomCard.svelte';
	import RoomMenu from './RoomMenu.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const NO_ROOM = 'no-room';
	const collapsed = new CollapsedState(() => data.project.id);
	onMount(() => collapsed.load());

	const unitSystem = $derived(data.project.unitSystem);
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const photoNumbers = $derived(new Map(data.photos.map((p, i) => [p.id, i + 1])));
	function groupByRoom<T extends { roomId: string | null }>(items: T[]) {
		const groups = new Map<string | null, T[]>();
		for (const item of items) {
			const group = groups.get(item.roomId);
			if (group) group.push(item);
			else groups.set(item.roomId, [item]);
		}
		return groups;
	}
	const photosByRoom = $derived(groupByRoom(data.photos));
	const annotationsByRoom = $derived(groupByRoom(data.annotations));
	const unassignedPhotos = $derived(photosByRoom.get(null) ?? []);

	// Go straight to the first new photo to start measuring, but only when every file made it;
	// otherwise stay here so the list of failures stays visible.
	const uploads = new UploadQueue(
		() => data.project.id,
		async (items) => {
			if (items.some((i) => i.status === 'uploaded')) {
				try {
					await invalidateAll();
				} catch {
					// Offline right after uploading: the list below still shows what happened.
					return;
				}
			}
			if (items.length && items.every((i) => i.status === 'uploaded')) {
				await goto(`/p/${data.project.id}/photo/${items[0].photoId}`);
			}
		}
	);
	onDestroy(() => uploads.destroy());
	beforeNavigate(({ cancel, willUnload }) => {
		if (!uploads.busy) return;
		// Closing the tab or reloading gets the browser's own prompt; in-app links get ours.
		if (willUnload || !confirm('Photos are still uploading. Leave anyway?')) cancel();
	});
	const uploadFiles = (files: FileList, roomId: string | null) => uploads.add(files, roomId);
</script>

<svelte:head><title>{data.project.name} · Mehzur</title></svelte:head>

<FormError message={form?.error} />

<section>
	<UploadList {uploads} />

	<div class="rooms">
		{#each data.rooms as room (room.id)}
			{@const roomPhotos = photosByRoom.get(room.id) ?? []}
			{@const roomAnnotations = annotationsByRoom.get(room.id) ?? []}
			{@const area = room.areaMm2 !== null ? formatArea(room.areaMm2, unitSystem) : null}
			<RoomCard
				id={room.id}
				title={room.name}
				collapsed={collapsed.has(room.id)}
				ontoggle={() => collapsed.toggle(room.id)}
				summary="{area ? `${area} · ` : ''}{plural(roomPhotos.length, 'photo')} · {plural(roomAnnotations.length, 'measurement')}"
			>
				{#snippet menu()}
					<RoomMenu {room} measured={roomAnnotations.filter((a) => a.valueMm !== null)} {unitSystem} />
				{/snippet}

				{#if area}<p class="area">{area}</p>{/if}
				<h4>Photos</h4>
				<PhotoGrid
					projectId={data.project.id}
					photos={roomPhotos}
					{photoNumbers}
					label={room.name}
					onfiles={(files) => uploadFiles(files, room.id)}
				/>
				{#if roomAnnotations.length}
					<h4>Measurements</h4>
					<ul class="room-measurements">
						{#each roomAnnotations as a (a.id)}
							<MeasurementRow
								variant="compact"
								href="/p/{data.project.id}/photo/{a.photoId}?select={a.id}"
								name={measurementName(a)}
								value={formatValue(a.valueMm, unitSystem, '—')}
								photo={photoNumbers.get(a.photoId)}
							/>
						{/each}
					</ul>
				{/if}
			</RoomCard>
		{/each}

		<RoomCard
			id={NO_ROOM}
			title="No room"
			variant="unassigned"
			collapsed={collapsed.has(NO_ROOM)}
			ontoggle={() => collapsed.toggle(NO_ROOM)}
			summary={plural(unassignedPhotos.length, 'photo')}
		>
			<p class="empty">Photos that aren't in a room yet.</p>
			<h4>Photos</h4>
			<PhotoGrid
				projectId={data.project.id}
				photos={unassignedPhotos}
				{photoNumbers}
				label="No room"
				onfiles={(files) => uploadFiles(files, null)}
			/>
		</RoomCard>
	</div>
	<AddRoom />
</section>

{#if data.annotations.length > 0}
	<MeasurementTable
		projectId={data.project.id}
		annotations={data.annotations}
		rooms={data.rooms}
		{photoNumbers}
		{unitSystem}
	/>
{/if}

<style>
	.empty {
		margin: 0.4rem 0;
	}
	.rooms {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0 0;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		align-items: start;
	}
	h4 {
		margin: 0.4rem 0;
		font-size: 0.95rem;
	}
	.area {
		margin: 0.6rem 0;
		font-size: 1.6rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.room-measurements {
		list-style: none;
		padding: 0;
		margin: 0 0 0.6rem;
		display: grid;
		gap: 0.3rem;
	}
</style>
