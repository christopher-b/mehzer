<script lang="ts">
	import PhotoView from './PhotoView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!--
	SvelteKit keeps this page mounted when you move between photos, so the view is keyed on the
	photo: each photo starts fresh (no leftover selection, half-placed point, dialog or menu).
-->
{#key data.photo.id}
	<PhotoView {data} />
{/key}
