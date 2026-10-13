<script lang="ts">
  import { onVisible, reducedMotion } from '../../lib/sync';
  import { FC, N_ALL, share, type FcRec } from '../../lib/forecasts';

  let { recs }: { recs: FcRec[] } = $props();

  const COLS = 30;
  const ORDER = { wrong: 0, release: 1, '': 2 } as const;

  const groups = $derived(
    (['reference', 'mover'] as const).map((role) => {
      const rs = recs.filter((r) => r.role === role);
      const [k, n] = FC.roleEvents[role];
      const wrong = rs.filter((r) => r.ev === 'wrong').length;
      const release = rs.filter((r) => r.ev === 'release').length;
      if (rs.length !== n || wrong + release !== k) throw new Error(`RoleWaffle: ${role} disagrees with the study`);
      const cells = [...rs].sort((a, b) => ORDER[a.ev] - ORDER[b.ev] || a.i - b.i).map((r, j) => ({ id: r.id, ev: r.ev, x: j % COLS, y: Math.floor(j / COLS) }));
      return {
        role,
        k,
        n,
        wrong,
        release,
        cells,
        rows: Math.ceil(n / COLS),
        title: role === 'reference' ? 'Labels named the reference object as moving' : 'Labels named the requested object as moving',
      };
    }),
  );
  const rest = $derived.by(() => {
    const rs = recs.filter((r) => r.role !== 'reference' && r.role !== 'mover');
    return { n: rs.length, k: rs.filter((r) => r.ev).length };
  });
  const total = $derived(recs.filter((r) => r.ev).length);

  let on = $state(true);
  function reveal(node: HTMLElement) {
    if (reducedMotion()) return;
    let first = true;
    return onVisible(
      node,
      (v) => {
        if (first) {
          first = false;
          if (!v) on = false;
          return;
        }
        if (v) on = true;
      },
      0.3,
    );
  }
</script>

<figure class="fig role" class:on {@attach reveal}>
  <p class="tag"><span>Exploratory</span> Comparison made after seeing the results</p>

  <div class="pair">
    {#each groups as g (g.role)}
      <div class="g {g.role}">
        <p class="gt">{g.title}</p>
        <p class="rate">
          <span class="big num">{share(g.k, g.n)}%</span>
          <span class="of">detected errors in <b class="num">{g.k}</b> of {g.n} chunks</span>
        </p>
        <svg viewBox="0 0 {COLS} {g.rows}" style:--rows={g.rows} aria-hidden="true">
          {#each g.cells as c, j (c.id)}
            {#if c.ev === 'release'}
              <circle class="ev release" style:--j={j} cx={c.x + 0.5} cy={c.y + 0.5} r="0.42" />
            {:else if c.ev === 'wrong'}
              <rect class="ev wrong" style:--j={j} x={c.x + 0.08} y={c.y + 0.08} width="0.84" height="0.84" rx="0.08" />
            {:else}
              <rect x={c.x + 0.08} y={c.y + 0.08} width="0.84" height="0.84" rx="0.2" />
            {/if}
          {/each}
        </svg>
        <p class="split">
          <span><i class="mk sq" aria-hidden="true"></i>{g.wrong} wrong-object</span>
          <span><i class="mk ci" aria-hidden="true"></i>{g.release} contradictory release</span>
        </p>
      </div>
    {/each}
  </div>

  <figcaption class="caption">
    Each cell is one selected forecast, grouped by the moving object its final labels named; filled cells are chunks with a detected error of
    either kind. The remaining {rest.n} forecasts, whose labels named no moving object, another object, several objects or could not tell,
    accompanied {rest.k} of the {total} detected errors among all {N_ALL}. This comparison does not adjust for scene, goal or model, so it does
    not establish added predictive value.
  </figcaption>
</figure>

<style>
  .role {
    container-type: inline-size;
    --cell: 9px;
    margin: 22px 0 0;
  }

  .tag {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 0 0 18px;
    font-size: 0.82rem;
    color: var(--stage-muted);
  }

  .tag span {
    padding: 3px 9px;
    border: 1px solid #ffd27a;
    border-radius: 999px;
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ffd27a;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 26px 40px;
    align-items: start;
  }

  .g {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .gt {
    margin: 0;
    padding-left: 10px;
    border-left: 3px solid var(--ref-2);
    font-size: 0.92rem;
    font-weight: 600;
    color: #fff;
  }

  .mover .gt {
    border-left-color: var(--mover-2);
  }

  .rate {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin: 0;
  }

  .big {
    font-family: var(--serif);
    font-size: clamp(2.3rem, 4.4vw, 3.1rem);
    line-height: 1;
    color: #fff;
  }

  .of {
    font-size: 0.86rem;
    color: #c9ced6;
  }

  .of b {
    font-weight: 600;
    color: #fff;
  }

  svg {
    display: block;
    width: min(100%, calc(30 * var(--cell)));
    height: auto;
  }

  rect {
    fill: rgb(255 255 255 / 9%);
  }

  rect.wrong {
    fill: var(--wrong);
  }

  circle.release {
    fill: var(--release);
  }

  .ev {
    transform-box: fill-box;
    transform-origin: center;
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) calc(var(--j) * 22ms + 150ms);
  }

  .role:not(.on) .ev {
    transform: scale(0);
  }

  .split {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 0;
    font-size: 0.8rem;
    color: #c9ced6;
  }

  .split span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .mk {
    display: inline-block;
    width: 10px;
    height: 10px;
  }

  .mk.sq {
    border-radius: 2px;
    background: var(--wrong);
  }

  .mk.ci {
    border-radius: 50%;
    background: var(--release);
  }

  .caption {
    margin-top: 18px;
  }

  @container (max-width: 600px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ev {
      transition: none;
    }
  }
</style>
