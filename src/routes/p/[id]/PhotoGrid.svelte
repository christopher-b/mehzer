<script lang="ts">
	import { enhance } from '$app/forms';
	import { submitWith } from '#lib/client/enhance.ts';
	import AddTile from '#lib/components/ui/AddTile.svelte';
	import type { PageData } from './$types';

	type ProjectPhoto = PageData['photos'][number];

	let {
		projectId,
		photos,
		photoNumbers,
		label,
		onfiles
	}: {
		projectId: string;
		photos: ProjectPhoto[];
		photoNumbers: Map<string, number>;
		/** Names the "+" tile: "Add photos to <label>". */
		label: string;
		onfiles: (files: FileList) => unknown;
	} = $props();
</script>

<ul class="grid">
	{#each photos as photo (photo.id)}
		<li>
			<a href="/p/{projectId}/photo/{photo.id}">
				<img
					src="/api/photos/{photo.blobKey}"
					alt="Photo {photoNumbers.get(photo.id)}"
					width={photo.width}
					height={photo.height}
					loading="lazy"
				/>
			</a>
			<form
				method="POST"
				action="?/deletePhoto"
				use:enhance={submitWith({ confirm: () => confirm('Delete this photo and its measurements?') })}
			>
				<input type="hidden" name="photoId" value={photo.id} />
				<button type="submit" class="remove" aria-label="Delete photo {photoNumbers.get(photo.id)}">✕</button>
			</form>
		</li>
	{/each}
	<li class="add-photo">
		<AddTile mode="file" accept="image/*" multiple ariaLabel="Add photos to {label}" {onfiles} />
	</li>
</ul>

<style>
	.grid {
		list-style: none;
		padding: 0;
		margin: 0.4rem 0 0.6rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 0.6rem;
	}
	.grid li {
		position: relative;
	}
	.grid img {
		display: block;
		width: 100%;
		height: 6.5rem;
		object-fit: cover;
		border-radius: var(--radius-md);
		background: var(--placeholder);
	}
	/* Dark chip with white text: readable on any photo, light or dark, and a comfortable tap target. */
	.remove {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid rgb(255 255 255 / 0.9);
		border-radius: 50%;
		background: rgb(0 0 0 / 0.75);
		color: white;
		font-size: 1rem;
		line-height: 1;
	}
	.remove:hover {
		background: var(--danger);
	}
</style>
