<script lang="ts">
  import { OBJ_SHORT, REL_WORD, type Answer } from '../../lib/vqa';

  /** Top-down sketch of one reading of the goal, in the site's convention: the robot at the top facing the viewer, so
   *  the robot's left is screen right and "in front of" (closer to the robot) is screen up. The named reference sits
   *  in the centre; the named target sits where the relation puts it. Colours follow the objects' roles in the
   *  instruction, so an answer that swaps the roles also swaps the colours. */
  let {
    answer,
    mover,
    label,
    tone = 'neutral',
    pending = false,
  }: { answer: Answer; mover: string; label: string; tone?: 'neutral' | 'ok' | 'bad'; pending?: boolean } = $props();

  const W = 220;
  const H = 136;
  const CX = 110;
  const CY = 80;
  const POS: Record<string, [number, number]> = {
    left_of: [CX + 72, CY],
    right_of: [CX - 72, CY],
    in_front_of: [CX, CY - 38],
    behind: [CX, CY + 38],
    on_top_supported: [CX, CY - 13],
    stacked_on: [CX, CY - 13],
    unknown: [CX + 64, CY + 38],
  };
  const SLOTS = [POS.left_of, POS.right_of, POS.in_front_of, POS.behind];
  /* Label widths in viewBox units for 12.8-unit Inter semibold (measured in the browser), so the boxes hug their
   * labels and the widest pair (raisin box beside mustard) still clears at the ±72 slots. The glyph renders at
   * 166 px or wider, which keeps every label at 9.6 px or more. */
  const TEXT_W: Record<string, number> = { cube: 30.8, bowl: 29.7, banana: 45.9, butter: 37.3, 'raisin box': 59.9, mustard: 51.1 };
  const width = (name: string, unknown = false) =>
    Math.round((TEXT_W[OBJ_SHORT[name]] ?? OBJ_SHORT[name].length * 6.6) + (unknown ? 10.1 : 0) + 13);

  const at = $derived(POS[answer.relation] ?? POS.unknown);
  const onTop = $derived(answer.relation === 'on_top_supported' || answer.relation === 'stacked_on');
  const role = (o: string) => (o === mover ? 'mover' : 'ref');
  const said = $derived(
    pending
      ? 'waiting for the answer…'
      : answer.relation === 'unknown'
        ? `${OBJ_SHORT[answer.target]} vs ${OBJ_SHORT[answer.reference]}: unknown`
        : `${OBJ_SHORT[answer.target]} ${REL_WORD[answer.relation]} ${OBJ_SHORT[answer.reference]}`,
  );
</script>

<figure class="rg {tone}" class:pending>
  <figcaption>{label}</figcaption>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="{label}: {said}">
    <path class="robot" d="M{CX - 18} 3 h36 a18 12 0 0 1 -36 0 z" />
    <text class="hint" x={CX - 25} y="13" text-anchor="end">◂ right</text>
    <text class="hint" x={CX + 25} y="13">left ▸</text>
    <text class="hint" x={CX} y="29" text-anchor="middle">robot</text>
    {#each SLOTS as [x, y], i (i)}
      <rect class="slot" x={x - 22} y={y - 9} width="44" height="18" rx="5" />
    {/each}

    <g class="obj {role(answer.reference)}" transform="translate({CX} {CY + (onTop ? 6 : 0)})">
      <rect x={-width(answer.reference) / 2} y="-11" width={width(answer.reference)} height="22" rx="6" />
      <text y="4.5" text-anchor="middle">{OBJ_SHORT[answer.reference]}</text>
    </g>
    <g class="obj tgt {role(answer.target)}" class:top={onTop} style:transform="translate({at[0]}px, {at[1]}px)">
      <rect
        x={-width(answer.target, answer.relation === 'unknown') / 2}
        y="-11"
        width={width(answer.target, answer.relation === 'unknown')}
        height="22"
        rx="6"
      />
      <text y="4.5" text-anchor="middle">{OBJ_SHORT[answer.target]}{answer.relation === 'unknown' ? ' ?' : ''}</text>
    </g>
  </svg>
  <p class="said">{said}</p>
</figure>

<style>
  .rg {
    margin: 0;
    min-width: 0;
    border-radius: 12px;
    padding: 9px 10px 8px;
    background: rgb(255 255 255 / 3%);
    border: 1px solid var(--stage-rule);
    transition: border-color 0.3s, background 0.3s;
  }

  .rg.ok {
    border-color: color-mix(in srgb, var(--vq-ok-2) 50%, transparent);
  }

  .rg.bad {
    border-color: color-mix(in srgb, var(--vq-rev-2) 70%, transparent);
    background: color-mix(in srgb, var(--vq-rev-2) 8%, transparent);
  }

  figcaption {
    font-family: var(--mono);
    font-size: 0.64rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--stage-muted);
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    margin-top: 4px;
    overflow: visible;
  }

  .robot {
    fill: var(--stage-muted);
    opacity: 0.55;
  }

  .hint {
    font-family: var(--mono);
    font-size: 12.8px;
    fill: var(--stage-muted);
    opacity: 0.85;
  }

  .slot {
    fill: none;
    stroke: rgb(255 255 255 / 14%);
    stroke-dasharray: 3 3;
  }

  .obj text {
    font-family: var(--sans);
    font-size: 12.8px;
    font-weight: 600;
  }

  .obj {
    transition: opacity 0.35s;
  }

  .pending .obj {
    opacity: 0.2;
  }

  .pending .said {
    color: var(--stage-muted);
  }

  .obj.mover rect {
    fill: color-mix(in srgb, var(--mover) 55%, var(--stage-2));
  }

  .obj.mover text {
    fill: #bff3fb;
  }

  .obj.ref rect {
    fill: color-mix(in srgb, var(--ref) 52%, var(--stage-2));
  }

  .obj.ref text {
    fill: #ffe0cb;
  }

  .tgt {
    transition: transform 0.6s var(--ease);
  }

  .tgt rect {
    stroke: rgb(255 255 255 / 55%);
    stroke-width: 1;
  }

  .tgt.top rect {
    filter: drop-shadow(0 2px 3px rgb(0 0 0 / 60%));
  }

  .said {
    margin: 6px 0 0;
    font-size: 0.8rem;
    line-height: 1.3;
    color: var(--stage-ink);
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .tgt {
      transition: none;
    }
  }
</style>
