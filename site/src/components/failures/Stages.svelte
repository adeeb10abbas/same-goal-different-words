<script lang="ts">
  import { FORM_NAME, FORM_ORDER, FORM_SHORT, MODELS, STAGE_LABEL, type FormId, type ModelId } from '../../lib/study';
  import { STAGES, addCells, share, signed, sumSplit, type Agg, type Cell, type Stage } from '../../lib/failures';

  let { agg }: { agg: Agg } = $props();

  /** Achieve and maintain episodes of one cell; maintain episodes are kept apart so the bar can mark them. */
  const row = (m: ModelId | 'all', f: FormId) => {
    const s = sumSplit(agg, m, f);
    const all: Cell = addCells(s.achieve, s.maintain);
    let sum = 0;
    for (const k of STAGES) sum += all.stages[k];
    if (sum !== all.n) throw new Error('Failures stages: stage counts do not add up');
    return { m, f, all, maintainStable: s.maintain.stages.stable, maintainN: s.maintain.n };
  };
  const groups = $derived([
    ...MODELS.map((m) => ({ id: m.id as ModelId | 'all', name: m.short, rows: FORM_ORDER.map((f) => row(m.id, f)) })),
    { id: 'all' as const, name: 'All models', rows: FORM_ORDER.map((f) => row('all', f)) },
  ]);
  /** Pooled over models: reference-first minus target-first, in episodes per stage. */
  const diff = $derived.by(() => {
    const tf = row('all', 'S').all;
    const rf = row('all', 'I').all;
    return { n: tf.n, d: STAGES.map((k) => ({ k, tf: tf.stages[k], rf: rf.stages[k], d: rf.stages[k] - tf.stages[k] })) };
  });
  const maxAbs = $derived(Math.max(1, ...diff.d.map((x) => Math.abs(x.d))));
  const w = (x: number, of: number) => `${of > 0 ? (100 * x) / of : 0}%`;
</script>

<div class="st">
  <p class="badge"><span>Descriptive</span> no test of significance</p>

  <ol class="legend" aria-label="Stages, in order">
    {#each STAGES as k, i (k)}
      <li><i class="sw {k}"></i><span class="num">{i + 1}</span> {STAGE_LABEL[k]}</li>
    {/each}
    <li><i class="sw stable maint"></i>Stable because the goal was already true at reset</li>
  </ol>

  <div class="grid" aria-hidden="true">
    {#each groups as g (g.id)}
      <div class="grp" class:pooled={g.id === 'all'}>
        <p class="gname">{g.name}</p>
        {#each g.rows as r (r.f)}
          <div class="r">
            <span class="form-pill {r.f}">{FORM_SHORT[r.f]}</span>
            <div class="track">
              {#each STAGES as k (k)}
                {@const c = r.all.stages[k] - (k === 'stable' ? r.maintainStable : 0)}
                <i class="bk {k}" style:width={w(c, r.all.n)} title="{STAGE_LABEL[k]}: {c} of {r.all.n}"></i>
                {#if k === 'stable'}
                  <i class="bk stable maint" style:width={w(r.maintainStable, r.all.n)} title="Already true at reset: {r.maintainStable} of {r.all.n}"></i>
                {/if}
              {/each}
            </div>
            <span class="pct num">{share(r.all.stages.stable, r.all.n, 0)}</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
  <p class="caption">
    Each bar is {groups[0].rows[0].all.n} episodes of one model and wording ({groups.at(-1)!.rows[0].all.n} for all models), split by the furthest stage
    reached; the number at the right is the share that reached a stable placement at some point. Hatched: episodes whose goal was already true at
    reset, which start in the goal and only have to keep it.
  </p>

  <div class="diff">
    <p class="lbl">Reference-first minus target-first, all models, episodes per stage (of {diff.n} each)</p>
    <div class="drows" aria-hidden="true">
      {#each diff.d as x (x.k)}
        <div class="dr">
          <span class="dn">{STAGE_LABEL[x.k]}</span>
          <div class="axis">
            <i class="neg-half">{#if x.d < 0}<b class="dbar {x.k}" style:width={w(-x.d, maxAbs)}></b>{/if}</i>
            <i class="pos-half">{#if x.d > 0}<b class="dbar {x.k}" style:width={w(x.d, maxAbs)}></b>{/if}</i>
          </div>
          <span class="dv num">{signed(x.d)}</span>
        </div>
      {/each}
    </div>
    <p class="caption">
      Under reference-first wording, more runs stop before lifting the target and fewer reach a stable placement. This describes the recorded
      distribution only; the paper does not test these stage differences, and the stage breakdown was computed for this website from the same
      simulator logs.
    </p>
  </div>

  <div class="sr-only"><table>
    <caption>Episodes by furthest stage reached, per model and wording</caption>
    <thead>
      <tr><th scope="col">Model</th><th scope="col">Wording</th>{#each STAGES as k (k)}<th scope="col">{STAGE_LABEL[k]}</th>{/each}<th scope="col">Episodes</th></tr>
    </thead>
    <tbody>
      {#each groups as g (g.id)}
        {#each g.rows as r (r.f)}
          <tr>
            <th scope="row">{g.name}</th><td>{FORM_NAME[r.f]}</td>{#each STAGES as k (k)}<td>{r.all.stages[k]}</td>{/each}<td>{r.all.n}</td>
          </tr>
        {/each}
      {/each}
      <tr>
        <th scope="row">All models</th><td>Reference-first minus target-first</td>{#each diff.d as x (x.k)}<td>{signed(x.d)}</td>{/each}<td></td>
      </tr>
    </tbody>
  </table></div>
</div>

<style>
  .st {
    container: st / inline-size;
    margin-top: clamp(22px, 3vw, 32px);
  }

  .badge {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    margin: 0;
    font-size: 0.8rem;
    color: var(--stage-muted);
  }

  .badge span {
    padding: 3px 10px;
    border-radius: 6px;
    border: 1px solid var(--lost-2);
    color: var(--lost-2);
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.8rem;
    line-height: 1.4;
    color: #c3c8d0;
  }

  .legend .num {
    color: var(--stage-muted);
  }

  .sw {
    display: inline-block;
    width: 11px;
    height: 11px;
    margin-right: 6px;
    border-radius: 2px;
    vertical-align: -1px;
  }

  .grid {
    display: grid;
    gap: 18px 28px;
    margin-top: 18px;
    padding: 18px;
    border-radius: 16px;
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
  }

  @container st (min-width: 46em) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .gname {
    margin: 0 0 6px;
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--stage-ink);
  }

  .pooled .gname {
    color: var(--kept-2);
  }

  .r {
    display: grid;
    grid-template-columns: 3.4em minmax(0, 1fr) 3em;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }

  .r .form-pill {
    justify-self: start;
  }

  .track {
    display: flex;
    height: 16px;
    border-radius: 4px;
    overflow: hidden;
    background: rgb(255 255 255 / 5%);
  }

  .bk {
    display: block;
    height: 100%;
  }

  .pct {
    font-size: 0.82rem;
    text-align: right;
    color: var(--stage-ink);
  }

  .no_mover_contact {
    background: #3a404b;
  }

  .contact_no_lift {
    background: #66707f;
  }

  .lift_no_goal {
    background: #9d8a63;
  }

  .goal_unstable {
    background: var(--lost-2);
  }

  .stable {
    background: var(--kept-2);
  }

  .stable.maint {
    background: repeating-linear-gradient(135deg, var(--kept-2) 0 2px, rgb(111 211 154 / 30%) 2px 5px);
  }

  .diff {
    margin-top: 22px;
    padding: 18px;
    border-radius: 16px;
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
  }

  .drows {
    margin-top: 12px;
  }

  .diff .lbl {
    color: var(--stage-muted);
  }

  .diff .caption {
    margin-top: 14px;
  }

  .dr {
    display: grid;
    grid-template-columns: minmax(0, 15em) minmax(0, 1fr) 3em;
    align-items: center;
    gap: 6px 12px;
    margin-top: 6px;
    font-size: 0.82rem;
    color: #c3c8d0;
  }

  .axis {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 14px;
  }

  .neg-half,
  .pos-half {
    display: flex;
    height: 100%;
  }

  .neg-half {
    justify-content: flex-end;
    border-right: 1px solid #6b7280;
  }

  .dbar {
    display: block;
    height: 100%;
    border-radius: 2px;
  }

  .dv {
    text-align: right;
    color: var(--stage-ink);
  }

  @container st (max-width: 30em) {
    .dr {
      grid-template-columns: minmax(0, 1fr) 3em;
    }

    .dn {
      grid-column: 1 / -1;
    }
  }
</style>
