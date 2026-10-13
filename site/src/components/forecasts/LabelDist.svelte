<script lang="ts">
  import { MODELS } from '../../lib/study';
  import { FC, FIELDS, N_ALL, VOCAB, share, sum, type Counts } from '../../lib/forecasts';

  type Who = 'All' | (typeof MODELS)[number]['id'];
  const uid = $props.id();
  let who = $state<Who>('All');
  const perModel = N_ALL / MODELS.length;
  const countsFor = (w: Who) => (w === 'All' ? FC.labels : FC.labelsByModel[w]);
  const total = $derived(who === 'All' ? N_ALL : perModel);

  // Every field must account for every forecast, overall and within each model.
  for (const w of ['All', ...MODELS.map((m) => m.id)] as Who[])
    for (const f of FIELDS) {
      const got = sum(Object.values(countsFor(w)[f.key] ?? {}));
      if (got !== (w === 'All' ? N_ALL : perModel)) throw new Error(`LabelDist: ${f.key} for ${w} sums to ${got}`);
    }

  const rows = (c: Counts, v: keyof typeof VOCAB) => VOCAB[v].map(([code, name]) => ({ code, name, k: c[code] ?? 0 }));
  const rel = $derived(rows(countsFor(who).fc_visible_final_relation, 'rel'));
  const lists = $derived(
    FIELDS.filter((f) => f.key !== 'fc_visible_final_relation' && f.key !== 'fc_missing_object').map((f) => ({
      ...f,
      // Keep the same rows in every view; an Unknown answer is listed only where it occurs at all.
      rows: rows(countsFor(who)[f.key], f.v).filter((r) => r.code !== 'unknown' || (FC.labels[f.key].unknown ?? 0) > 0),
    })),
  );
  const missing = $derived(countsFor(who).fc_missing_object);
  const pick = (w: Who) => (who = w);
  const NAMES: Record<string, string> = Object.fromEntries(MODELS.map((m) => [m.id, m.name]));
</script>

<div class="fig dist">
  <div class="top">
    <div class="seg" role="group" aria-label="Label counts by model">
      <button type="button" aria-pressed={who === 'All'} onclick={() => pick('All')}>All</button>
      {#each MODELS as m (m.id)}
        <button type="button" aria-pressed={who === m.id} onclick={() => pick(m.id)}>{m.short}</button>
      {/each}
    </div>
    <span class="n num">{who === 'All' ? 'All models' : NAMES[who]} · n&nbsp;=&nbsp;{total}</span>
  </div>

  <section class="rel" aria-labelledby="{uid}-rel">
    <h4 id="{uid}-rel">Final relation, classified against the goal</h4>
    <div class="stack" aria-hidden="true">
      {#each rel as r (r.code)}
        <i class={r.code} style:width="{(100 * r.k) / total}%"></i>
      {/each}
    </div>
    <ul class="leg">
      {#each rel as r (r.code)}
        <li>
          <span class="sw {r.code}" aria-hidden="true"></span>
          <span class="pc num">{share(r.k, total)}%</span>
          <span class="nm">{r.name}</span>
          <span class="ct num">{r.k} forecasts</span>
        </li>
      {/each}
    </ul>
  </section>

  <div class="lists">
    {#each lists as f (f.key)}
      <section class="list" aria-label={f.name}>
        <h4>{f.name}</h4>
        <ul>
          {#each f.rows as r (r.code)}
            <li class="{f.v}-{r.code}">
              <span class="nm">{r.name}</span>
              <span class="bar" aria-hidden="true"><i style:width="{(100 * r.k) / total}%"></i></span>
              <span class="pc num">{share(r.k, total)}%</span>
              <span class="ct num">{r.k}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <p class="missing">
    <b>Missing object</b> was labelled no in {missing.no ?? 0} of {total} forecasts.
  </p>

  <p class="caption">
    Final labels after disagreements were resolved; counts are forecasts. A requested or alternative relation was credited only when the
    labels identified the intended target as moving and matched that goal’s comparison object and relation, so “Neither” includes forecasts
    that named a different moving object. Direction categories keep the annotation’s own names. These model-generated labels are unverified:
    short grasping or lifting clips may reveal little about the eventual placement, but annotation errors are another explanation.
  </p>
</div>

<style>
  .dist {
    container-type: inline-size;
    display: grid;
    gap: 26px;
    --rq: var(--mover-2);
    --alt: #e5cf9a;
    --nei: #6b7280;
    --unk: #353a44;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 18px;
  }

  .n {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--stage-muted);
  }

  h4 {
    margin: 0 0 12px;
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--stage-muted);
  }

  .stack {
    display: flex;
    height: 30px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--unk);
  }

  .stack i {
    height: 100%;
    transition: width 0.6s var(--ease);
  }

  .stack i + i {
    box-shadow: inset 2px 0 0 var(--stage-2);
  }

  .goal {
    background: var(--rq);
  }

  .alternative_goal {
    background: var(--alt);
  }

  .not_goal {
    background: var(--nei);
  }

  .unknown {
    background: var(--unk);
    background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / 9%) 0 2px, transparent 2px 6px);
  }

  .leg {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px 18px;
  }

  .leg li {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr);
    column-gap: 8px;
    row-gap: 2px;
    align-items: center;
    align-content: start;
  }

  .leg .sw {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .leg .nm {
    grid-column: 2;
    font-size: 0.84rem;
    line-height: 1.35;
    color: var(--stage-ink);
  }

  .leg .pc {
    font-family: var(--serif);
    font-size: 1.7rem;
    line-height: 1.1;
    color: #fff;
  }

  .leg .ct {
    grid-column: 2;
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--stage-muted);
  }

  .lists {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 26px 40px;
  }

  .list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .list li {
    display: grid;
    grid-template-columns: minmax(7.5em, 0.9fr) minmax(0, 1fr) 3.4em 2.4em;
    gap: 10px;
    align-items: center;
    font-size: 0.84rem;
  }

  .list .nm {
    color: var(--stage-ink);
    min-width: 0;
  }

  .bar {
    height: 10px;
    border-radius: 3px;
    background: rgb(255 255 255 / 5%);
    overflow: hidden;
  }

  .bar i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: #8f96a3;
    transition: width 0.6s var(--ease);
  }

  .role-mover .bar i {
    background: var(--mover-2);
  }

  .role-reference .bar i {
    background: var(--ref-2);
  }

  .dir-up_only .bar i,
  .yn-yes .bar i {
    background: #e9ecf1;
  }

  .role-mover .nm {
    color: #8fe1f0;
  }

  .role-reference .nm {
    color: #ffc39b;
  }

  .list .pc,
  .list .ct {
    font-family: var(--mono);
    font-size: 0.76rem;
    text-align: right;
  }

  .list .pc {
    color: var(--stage-ink);
  }

  .list .ct {
    color: var(--stage-muted);
  }

  .missing {
    margin: 0;
    font-size: 0.86rem;
    color: #c9ced6;
  }

  .missing b {
    color: #fff;
    font-weight: 600;
  }

  .caption {
    margin: 0;
  }

  @container (max-width: 760px) {
    .lists {
      grid-template-columns: minmax(0, 1fr);
    }

    .leg {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 300px) {
    .seg button {
      padding-inline: 9px;
    }

    .list li {
      grid-template-columns: minmax(0, 1fr) 3.4em 2.4em;
    }

    .list .bar {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stack i,
    .bar i {
      transition: none;
    }
  }
</style>
