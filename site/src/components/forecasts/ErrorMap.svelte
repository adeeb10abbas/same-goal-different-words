<script lang="ts">
  import { MODELS, SCENES, FORM_ORDER, study } from '../../lib/study';
  import { FC, STARTS, N_ALL, type FcRec } from '../../lib/forecasts';

  let { recs }: { recs: FcRec[] } = $props();

  const E = FC.reported.events;
  const holdS = study.settings.scoring.holdS;
  const GAP = 0.6;

  // One block per model and scene: columns are goal × wording, rows are the eight starts.
  const blocks = $derived(
    MODELS.map((m) => {
      const scenes = SCENES.map((s) => {
        const cols = s.goals.length * FORM_ORDER.length;
        const cells = recs
          .filter((r) => r.m === m.id && r.g.startsWith(`${s.id}-`))
          .map((r) => {
            const gi = s.goals.findIndex((g) => g.key === r.g);
            const col = gi * FORM_ORDER.length + FORM_ORDER.indexOf(r.f);
            return { id: r.id, ev: r.ev, x: col + gi * GAP, y: r.c - 1 };
          });
        const row = FC.events.find((e) => e.model === m.id && e.scene === s.id)!;
        const wrong = cells.filter((c) => c.ev === 'wrong').length;
        const release = cells.filter((c) => c.ev === 'release').length;
        if (!row || cells.length !== row.event_scorable || wrong !== row.wrong_object || release !== row.contradictory_release)
          throw new Error(`ErrorMap: ${m.id} ${s.id} disagrees with the event table`);
        return { s, cells, w: cols + (s.goals.length - 1) * GAP, wrong, release, n: cells.length };
      });
      const n = scenes.reduce((a, b) => a + b.n, 0);
      const wrong = scenes.reduce((a, b) => a + b.wrong, 0);
      const release = scenes.reduce((a, b) => a + b.release, 0);
      const u = FC.utility.rows.find((r) => r.model === m.id)!;
      if (u.events !== wrong + release || u.n !== n) throw new Error(`ErrorMap: ${m.id} totals disagree with the utility table`);
      return { m, scenes, n, wrong, release };
    }),
  );
  const tot = $derived({
    wrong: blocks.reduce((a, b) => a + b.wrong, 0),
    release: blocks.reduce((a, b) => a + b.release, 0),
  });
  const pooled = FC.utility.rows.find((r) => r.model === 'All')!;
</script>

<div class="defs">
  <article class="def">
    <h4><span class="mk sq" aria-hidden="true"></span>Wrong-object manipulation</h4>
    <p>
      At least <span class="nw">{E.contactS}&nbsp;s</span> of continuous gripper contact with a non-target object, which moves at least
      <span class="nw">{E.displacementCm}&nbsp;cm</span> from its position at the start of the chunk.
    </p>
  </article>
  <article class="def">
    <h4><span class="mk ci" aria-hidden="true"></span>Contradictory release</h4>
    <p>
      The target detaches after contact, then rests supported and detached for at least <span class="nw">{E.supportedS}&nbsp;s</span> in exactly
      one registered alternative relation while the requested relation is false, all within the chunk. Alternatives were the other tested cube,
      butter and mustard relations; bowls had none.
    </p>
  </article>
</div>
<p class="note">
  Both checks read simulator state for the chunk of actions that accompanied each selected forecast. They differ from the
  <span class="nw">{holdS}-second</span> stable-placement endpoint used for task success, and they have not all been visually verified: contact
  followed by detachment can count as a release without substantive prior manipulation.
</p>

<figure class="fig map">
  <div class="legend">
    <span><i class="mk sq" aria-hidden="true"></i>Wrong-object <b class="num">{tot.wrong}</b></span>
    <span><i class="mk ci" aria-hidden="true"></i>Contradictory release <b class="num">{tot.release}</b></span>
    <span><i class="mk no" aria-hidden="true"></i>No detected error <b class="num">{N_ALL - tot.wrong - tot.release}</b></span>
  </div>

  {#each blocks as b (b.m.id)}
    <div class="mrow">
      <div class="who">
        <span class="mname">{b.m.name}</span>
        <span class="mtot"><b class="num">{b.wrong + b.release}</b> of {b.n} chunks</span>
        <span class="msplit"><span class="nw">{b.wrong} wrong-object</span> · <span class="nw">{b.release} release</span></span>
      </div>
      <div class="blocks">
        {#each b.scenes as sc (sc.s.id)}
          <div class="blk">
            <span class="bh"><span class="sc">{sc.s.short}</span><span class="k num">{sc.wrong + sc.release}/{sc.n}</span></span>
            <svg viewBox="0 0 {sc.w} {STARTS}" style:--w={sc.w} aria-hidden="true">
              {#each sc.cells as c (c.id)}
                {#if c.ev === 'release'}
                  <circle class="ev release" cx={c.x + 0.5} cy={c.y + 0.5} r="0.44" />
                {:else}
                  <rect class:ev={c.ev === 'wrong'} class:wrong={c.ev === 'wrong'} x={c.x + 0.07} y={c.y + 0.07} width="0.86" height="0.86" rx={c.ev ? 0.08 : 0.2} />
                {/if}
              {/each}
            </svg>
          </div>
        {/each}
      </div>
    </div>
  {/each}

  <div class="sr-only">
    <table>
      <caption>Detected errors per model and scene, as wrong-object plus contradictory-release chunks out of scored chunks</caption>
      <thead>
        <tr><th scope="col">Model</th>{#each SCENES as s (s.id)}<th scope="col">{s.short}</th>{/each}<th scope="col">Total</th></tr>
      </thead>
      <tbody>
        {#each blocks as b (b.m.id)}
          <tr>
            <th scope="row">{b.m.name}</th>
            {#each b.scenes as sc (sc.s.id)}<td>{sc.wrong} wrong-object, {sc.release} release, of {sc.n}</td>{/each}
            <td>{b.wrong + b.release} of {b.n}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <figcaption class="caption">
    Every cell is the chunk of actions that accompanied one of the {pooled.n} selected forecasts. Within each scene, columns group the three
    wordings of each goal and rows are the eight starts. The scorer marked {pooled.events} chunks: {tot.wrong} wrong-object and {tot.release}
    contradictory-release detections. To watch the forecasts behind them, step through the detected errors in the viewer above.
  </figcaption>
</figure>

<style>
  .defs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 22px;
  }

  .def {
    padding: 16px 18px 6px;
    border: 1px solid var(--stage-rule);
    border-radius: var(--radius);
    background: var(--stage-2);
  }

  .def h4 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 8px;
    font-size: 1rem;
    font-weight: 600;
    color: #fff;
  }

  .def p {
    margin: 0 0 10px;
    font-size: 0.9rem;
    line-height: 1.55;
    color: #c9ced6;
  }

  .mk {
    flex: none;
    display: inline-block;
    width: 12px;
    height: 12px;
  }

  .mk.sq {
    border-radius: 2px;
    background: var(--wrong);
  }

  .mk.ci {
    border-radius: 50%;
    background: var(--release);
  }

  .mk.no {
    border-radius: 3px;
    background: rgb(255 255 255 / 14%);
  }

  .note {
    margin-top: 14px;
  }

  .map {
    container-type: inline-size;
    --cell: 12px;
    display: grid;
    gap: 18px;
    margin: 26px 0 0;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 22px;
    font-size: 0.84rem;
    color: #c9ced6;
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .legend b {
    font-family: var(--mono);
    font-weight: 500;
    color: #fff;
  }

  .mrow {
    display: grid;
    grid-template-columns: 9.5em minmax(0, 1fr);
    gap: 10px 20px;
    align-items: start;
    padding-top: 16px;
    border-top: 1px solid var(--stage-rule);
  }

  .who {
    display: grid;
    gap: 2px;
  }

  .mname {
    font-weight: 600;
    color: #fff;
  }

  .mtot {
    font-size: 0.86rem;
    color: #c9ced6;
  }

  .mtot b {
    font-family: var(--serif);
    font-size: 1.5rem;
    font-weight: 400;
    color: #fff;
  }

  .msplit {
    font-size: 0.76rem;
    color: var(--stage-muted);
  }

  .blocks {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 20px;
  }

  .blk {
    display: grid;
    gap: 6px;
  }

  .bh {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.76rem;
  }

  .sc {
    color: var(--stage-ink);
  }

  .k {
    font-family: var(--mono);
    color: var(--stage-muted);
  }

  svg {
    display: block;
    width: calc(var(--w) * var(--cell));
    height: auto;
    overflow: visible;
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

  .caption {
    margin-top: 0;
  }

  @container (max-width: 640px) {
    .mrow {
      grid-template-columns: minmax(0, 1fr);
    }

    .who {
      grid-template-columns: auto auto;
      justify-content: start;
      align-items: baseline;
      column-gap: 12px;
    }

    .msplit {
      grid-column: 1 / -1;
    }
  }

  @container (max-width: 400px) {
    .blocks {
      --cell: 10px;
      gap: 12px 16px;
    }
  }

  @media (max-width: 700px) {
    .defs {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
