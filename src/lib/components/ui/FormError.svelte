<script lang="ts">
	let { message, id, style }: { message: string | null | undefined; id?: string; style?: string } = $props();
</script>

{#if message}<p class="error" role="alert" {id} {style}>{message}</p>{/if}
