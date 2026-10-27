<script lang="ts" module>
	export interface Point {
		x: number;
		y: number;
	}

	export interface Line {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}

	export interface CanvasAnnotation extends Line {
		id: string;
		label: string;
	}
</script>

<script lang="ts">
	interface Props {
		src: string;
		alt: string;
		width: number;
		height: number;
		annotations: CanvasAnnotation[];
		selectedId: string | null;
		/** A line awaiting confirmation (e.g. while the measurement dialog is open). */
		draft?: Line | null;
		/** Set to false to ignore taps (e.g. while a dialog is open). */
		interactive?: boolean;
		onselect: (id: string | null) => void;
		oncreate: (line: Line) => void;
		onmove: (id: string, line: Line) => void;
		/** True while the first point of a new line is placed and the second is awaited. */
		pending?: boolean;
	}

	let {
		src,
		alt,
		width,
		height,
		annotations,
		selectedId,
		draft = null,
		interactive = true,
		onselect,
		oncreate,
		onmove,
		pending = $bindable(false)
	}: Props = $props();

	const NUDGE_STEP = 0.005;
	const NUDGE_STEP_LARGE = 0.02;
	const NUDGE_SAVE_MS = 400;
	const NUDGE_DIRECTIONS: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1]
	};

	let svg: SVGSVGElement;
	let displayWidth = $state(0);
	let pointA = $state<Point | null>(null);
	let hover = $state<Point | null>(null);
	let drag = $state<{ id: string; end: 1 | 2; line: Line } | null>(null);
	let suppressClick = false;
	/** A line being moved with the arrow keys; saved once the keys have been still for `NUDGE_SAVE_MS`. */
	let nudged = $state<{ id: string; line: Line } | null>(null);
	let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(nudgeTimer));

	/** Image pixels per CSS pixel, so markers and text keep a constant on-screen size. */
	const k = $derived(displayWidth ? width / displayWidth : 1);

	function setPointA(p: Point | null) {
		pointA = p;
		pending = p !== null;
	}

	export function cancel() {
		setPointA(null);
		hover = null;
	}

	function toPoint(e: PointerEvent | MouseEvent): Point {
		const rect = svg.getBoundingClientRect();
		const clamp = (n: number) => Math.min(1, Math.max(0, n));
		return {
			x: clamp((e.clientX - rect.left) / rect.width),
			y: clamp((e.clientY - rect.top) / rect.height)
		};
	}

	/** Distance in CSS pixels between two normalized points. */
	function screenDistance(a: Point, b: Point) {
		const rect = svg.getBoundingClientRect();
		return Math.hypot((a.x - b.x) * rect.width, (a.y - b.y) * rect.height);
	}

	function onBackgroundClick(e: MouseEvent) {
		if (!interactive) return;
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		const p = toPoint(e);
		if (!pointA) {
			if (selectedId) {
				onselect(null);
				return;
			}
			setPointA(p);
			hover = p;
			return;
		}
		if (screenDistance(pointA, p) < 6) return;
		oncreate({ x1: pointA.x, y1: pointA.y, x2: p.x, y2: p.y });
		setPointA(null);
		hover = null;
	}

	function onPointerMove(e: PointerEvent) {
		if (drag) {
			const p = toPoint(e);
			drag.line = drag.end === 1 ? { ...drag.line, x1: p.x, y1: p.y } : { ...drag.line, x2: p.x, y2: p.y };
		} else if (pointA && e.pointerType === 'mouse') {
			hover = toPoint(e);
		}
	}

	function startDrag(e: PointerEvent, a: CanvasAnnotation, end: 1 | 2) {
		if (!interactive) return;
		e.stopPropagation();
		e.preventDefault();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		drag = { id: a.id, end, line: { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 } };
	}

	function cancelDrag() {
		if (!drag) return;
		drag = null;
		suppressClick = true;
		setTimeout(() => (suppressClick = false), 0);
	}

	function endDrag() {
		if (!drag) return;
		const { id, line } = drag;
		const original = annotations.find((a) => a.id === id);
		drag = null;
		suppressClick = true;
		// The click event that follows pointerup must not be treated as a new point.
		setTimeout(() => (suppressClick = false), 0);
		if (original && (original.x1 !== line.x1 || original.y1 !== line.y1 || original.x2 !== line.x2 || original.y2 !== line.y2)) {
			onmove(id, line);
		}
	}

	function onHandleKeydown(e: KeyboardEvent, a: CanvasAnnotation, end: 1 | 2) {
		const direction = NUDGE_DIRECTIONS[e.key];
		if (!direction || e.altKey || e.ctrlKey || e.metaKey || !interactive) return;
		e.preventDefault();
		const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
		const clamp = (n: number) => Math.min(1, Math.max(0, n));
		const [dx, dy] = direction;
		const line: Line =
			end === 1
				? { x1: clamp(a.x1 + dx * step), y1: clamp(a.y1 + dy * step), x2: a.x2, y2: a.y2 }
				: { x1: a.x1, y1: a.y1, x2: clamp(a.x2 + dx * step), y2: clamp(a.y2 + dy * step) };
		if (line.x1 === line.x2 && line.y1 === line.y2) return;
		nudged = { id: a.id, line };
		clearTimeout(nudgeTimer);
		nudgeTimer = setTimeout(() => {
			if (!nudged) return;
			const { id, line } = nudged;
			nudged = null;
			onmove(id, line);
		}, NUDGE_SAVE_MS);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && pointA) {
			cancel();
		}
	}

	const lines = $derived(
		annotations.map((a) =>
			drag && drag.id === a.id ? { ...a, ...drag.line } : nudged && nudged.id === a.id ? { ...a, ...nudged.line } : a
		)
	);
	const selected = $derived(lines.find((a) => a.id === selectedId) ?? null);

	const px = (v: number) => v * width;
	const py = (v: number) => v * height;

	/** Label placement: midpoint, rotated along the line but never upside down. */
	function labelTransform(a: Line) {
		const mx = px((a.x1 + a.x2) / 2);
		const my = py((a.y1 + a.y2) / 2);
		let angle = (Math.atan2(py(a.y2) - py(a.y1), px(a.x2) - px(a.x1)) * 180) / Math.PI;
		if (angle > 90) angle -= 180;
		if (angle < -90) angle += 180;
		return `translate(${mx} ${my}) rotate(${angle})`;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="canvas" bind:clientWidth={displayWidth}>
	<img {src} {alt} {width} {height} draggable="false" />
	<svg
		bind:this={svg}
		viewBox="0 0 {width} {height}"
		preserveAspectRatio="none"
		role="group"
		aria-label="Photo annotations"
		onpointermove={onPointerMove}
		onpointerup={endDrag}
		onpointercancel={cancelDrag}
		class:editing={selectedId !== null && interactive}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<rect class="background" {width} {height} onclick={onBackgroundClick} />

		{#each lines as a (a.id)}
			{@const isSelected = a.id === selectedId}
			<g class="annotation" class:selected={isSelected} class:muted={pointA !== null}>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<line
					class="hit"
					x1={px(a.x1)}
					y1={py(a.y1)}
					x2={px(a.x2)}
					y2={py(a.y2)}
					onclick={(e) => {
						if (!interactive || pointA) return onBackgroundClick(e);
						e.stopPropagation();
						onselect(a.id);
					}}
				/>
				<line class="stroke" x1={px(a.x1)} y1={py(a.y1)} x2={px(a.x2)} y2={py(a.y2)} />
				<circle class="end" cx={px(a.x1)} cy={py(a.y1)} r={3.5 * k} />
				<circle class="end" cx={px(a.x2)} cy={py(a.y2)} r={3.5 * k} />
				<text transform={labelTransform(a)} y={-8 * k} font-size={15 * k} stroke-width={4 * k}>
					{a.label}
				</text>
			</g>
		{/each}

		{#if selected && interactive && !pointA}
			{#each [1, 2] as const as end}
				{@const cx = px(end === 1 ? selected.x1 : selected.x2)}
				{@const cy = py(end === 1 ? selected.y1 : selected.y2)}
				<g
					class="handle"
					role="button"
					tabindex="0"
					aria-label="{end === 1 ? 'Start' : 'End'} of {selected.label}"
					onpointerdown={(e) => startDrag(e, selected, end)}
					onlostpointercapture={endDrag}
					onkeydown={(e) => onHandleKeydown(e, selected, end)}
				>
					<circle class="grab" {cx} {cy} r={22 * k} />
					<circle class="dot" {cx} {cy} r={11 * k} />
				</g>
			{/each}
		{/if}

		{#if draft}
			<g class="draft">
				<line class="stroke" x1={px(draft.x1)} y1={py(draft.y1)} x2={px(draft.x2)} y2={py(draft.y2)} />
				<circle class="end" cx={px(draft.x1)} cy={py(draft.y1)} r={3.5 * k} />
				<circle class="end" cx={px(draft.x2)} cy={py(draft.y2)} r={3.5 * k} />
			</g>
		{/if}

		{#if pointA}
			<g class="draft">
				{#if hover}
					<line class="stroke dashed" x1={px(pointA.x)} y1={py(pointA.y)} x2={px(hover.x)} y2={py(hover.y)} />
				{/if}
				<circle class="pending" cx={px(pointA.x)} cy={py(pointA.y)} r={6 * k} stroke-width={2 * k} />
			</g>
		{/if}
	</svg>
</div>

<style>
	.canvas {
		position: relative;
		line-height: 0;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	img {
		width: 100%;
		height: auto;
		border-radius: var(--radius-md);
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	/* Browsers ignore touch-action on SVG shapes, so block panning on the whole overlay while
	   handles are visible; otherwise a touch drag becomes a scroll and gets cancelled. */
	svg.editing {
		touch-action: pinch-zoom;
	}
	.background {
		fill: transparent;
		cursor: crosshair;
	}
	.hit {
		stroke: transparent;
		stroke-width: 18px;
		vector-effect: non-scaling-stroke;
		cursor: pointer;
	}
	.muted .hit {
		cursor: crosshair;
	}
	.stroke {
		stroke: #ffd60a;
		stroke-width: 2.5px;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
		filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.8));
	}
	.dashed {
		stroke-dasharray: 6 4;
	}
	.end {
		fill: #ffd60a;
		pointer-events: none;
	}
	text {
		fill: #111;
		stroke: #ffd60a;
		paint-order: stroke;
		stroke-linejoin: round;
		font-family: system-ui, sans-serif;
		font-weight: 600;
		text-anchor: middle;
		pointer-events: none;
	}
	.selected .stroke {
		stroke: var(--accent);
	}
	.selected .end {
		fill: var(--accent);
	}
	.selected text {
		fill: white;
		stroke: var(--accent);
	}
	.handle {
		cursor: grab;
		touch-action: none;
	}
	.grab {
		fill: transparent;
		pointer-events: all;
	}
	.dot {
		fill: color-mix(in srgb, var(--accent) 25%, transparent);
		stroke: var(--accent);
		stroke-width: 2px;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.handle:focus-visible {
		outline: none;
	}
	.handle:focus-visible .dot {
		fill: color-mix(in srgb, var(--accent) 60%, transparent);
		stroke: #fff;
		stroke-width: 3px;
	}
	.draft .stroke {
		stroke: #ff453a;
	}
	.draft .end {
		fill: #ff453a;
	}
	.pending {
		fill: none;
		stroke: #ff453a;
		pointer-events: none;
	}
</style>
