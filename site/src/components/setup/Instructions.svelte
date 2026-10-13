<script lang="ts">
  import { SCENES, GOALS, FORM_ORDER, FORM_SHORT, FORM_NAME, tokenize } from '../../lib/study';
  import { INIT_GOALS, N, markShared, sharedPrefix, word, Word, type MarkedToken } from '../../lib/setup';

  let diff = $state(false);

  const rows = GOALS.map((g) => {
    const end = sharedPrefix(g);
    const cells = FORM_ORDER.map((f) => {
      const toks = tokenize(g.prompts[f].trim(), g);
      const marked: MarkedToken[] = f === 'D' ? toks.map((t) => ({ ...t, shared: false })) : markShared(toks, end);
      return { f, toks: marked };
    });
    return { g, cells };
  });
  if (rows.length * FORM_ORDER.length !== N.goals * N.forms) throw new Error('Instructions: wrong number of prompts');
  const added = GOALS.filter((g) => !g.native).length;
</script>

<div class="bar">
  <div class="seg" role="group" aria-label="Show">
    <button type="button" aria-pressed={!diff} onclick={() => (diff = false)}>Full text</button>
    <button type="button" aria-pressed={diff} onclick={() => (diff = true)}>What changes</button>
  </div>
  <p class="key">
    <span class="tok-mover">target</span>
    <span class="tok-ref">reference</span>
    <span class="tok-rel">relation</span>
  </p>
</div>
<p class="hint" aria-live="polite">
  {#if diff}
    Dimmed: the direct command, and the start that target-first and reference-first share up to “so that”.
  {:else}
    Each row is one goal; the three columns are its three wordings.
  {/if}
</p>

<div class="tw" class:diff>
  <table class="itable">
    <caption class="sr-only">The {N.goals * N.forms} instructions: {N.goals} goals, each in {word(N.forms)} wordings</caption>
    <thead>
      <tr>
        <th scope="col">Goal</th>
        {#each FORM_ORDER as f (f)}
          <th scope="col"><span class="form-pill {f}">{FORM_SHORT[f]}</span> {FORM_NAME[f]}</th>
        {/each}
      </tr>
    </thead>
    {#each SCENES as s (s.id)}
      <tbody>
        <tr class="scn"><th colspan={FORM_ORDER.length + 1} scope="colgroup">{s.title}</th></tr>
        {#each rows.filter((r) => r.g.scene.id === s.id) as r (r.g.key)}
          <tr>
            <th scope="row" class="goal">
              <span class="gname">{r.g.label}{#if r.g.initiallyTrue}<span class="ok" title="Already true at the start">&nbsp;✓</span>{/if}</span>
              <span class="badge" class:native={r.g.native}>{r.g.native ? 'RoboLab' : 'Added'}</span>
            </th>
            {#each r.cells as c (c.f)}
              <td class="p {c.f}"
                ><span class="form-pill {c.f} inl" aria-hidden="true">{FORM_SHORT[c.f]}</span><span class="instr"
                  >{#each c.toks as t, k (k)}<span class:shared={t.shared} class:tok-mover={t.kind === 'mover'} class:tok-ref={t.kind === 'ref'} class:tok-rel={t.kind === 'rel'}>{t.text}</span>{/each}</span
                ></td
              >
            {/each}
          </tr>
        {/each}
      </tbody>
    {/each}
  </table>
</div>

<ul class="notes">
  <li>
    <span class="ok">✓</span> The goal already holds at the start, so the robot only has to leave it in place. {Word(INIT_GOALS.length)}
    goals are like this; the other {word(N.goals - INIT_GOALS.length)} must be achieved.
  </li>
  <li>
    <span class="badge native">RoboLab</span> goals come with the benchmark. <span class="badge">Added</span> goals ({word(added)})
    reuse the same objects. Direct commands keep RoboLab’s text, spelling and capitalization included.
  </li>
  <li>
    For the bowls, reference-first says the reference is “underneath and supporting” the target. That is less specific than the
    nesting the scorer checks.
  </li>
</ul>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 18px;
    margin: 22px 0 6px;
  }

  /* The global muted label is 4.06:1 on the segmented track over the .alt background. */
  .bar .seg button[aria-pressed='false'] {
    color: var(--ink-2);
  }

  .bar .seg button[aria-pressed='false']:hover {
    color: var(--ink);
  }

  .key {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    font-size: 0.86rem;
  }

  .hint {
    margin: 0 0 12px;
    font-size: 0.84rem;
    color: var(--muted);
    min-height: 2.6em;
  }

  .tw {
    container-type: inline-size;
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    background: var(--card);
    overflow: hidden;
  }

  .itable {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  thead th {
    text-align: left;
    font-family: var(--sans);
    font-weight: 600;
    font-size: 0.82rem;
    padding: 12px 14px;
    border-bottom: 1px solid var(--rule-2);
    white-space: nowrap;
  }

  .scn th {
    text-align: left;
    padding: 14px 14px 6px;
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
  }

  tbody tr:not(.scn) {
    border-top: 1px solid var(--rule);
  }

  .scn + tr {
    border-top: none;
  }

  th.goal,
  td.p {
    vertical-align: top;
    padding: 9px 14px;
    text-align: left;
  }

  th.goal {
    width: 21%;
    font-weight: 600;
    font-size: 0.86rem;
  }

  .gname {
    display: block;
  }

  .badge {
    display: inline-block;
    margin-top: 4px;
    padding: 0 6px;
    border-radius: 6px;
    border: 1px solid var(--rule-2);
    font-family: var(--mono);
    font-size: 0.66rem;
    font-weight: 400;
    letter-spacing: 0.04em;
    color: var(--muted);
    white-space: nowrap;
  }

  .badge.native {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .instr {
    font-family: var(--serif);
  }

  .inl {
    display: none;
  }

  .shared,
  td.p.D .instr {
    transition: opacity 0.35s var(--ease);
  }

  .diff .shared,
  .diff td.p.D .instr {
    opacity: 0.32;
  }

  .ok {
    color: var(--kept);
    font-weight: 700;
  }

  .notes {
    margin: 14px 0 0;
    padding-left: 1.1em;
    color: var(--muted);
    font-size: 0.84rem;
    line-height: 1.55;
    display: grid;
    gap: 4px;
  }

  @container (max-width: 700px) {
    .itable,
    .itable tbody,
    .itable tr,
    .itable th,
    .itable td {
      display: block;
      width: auto;
    }

    .itable thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .itable tr:not(.scn) {
      padding: 10px 14px 12px;
    }

    th.goal,
    td.p {
      padding: 0;
    }

    th.goal {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 10px;
      align-items: baseline;
      margin-bottom: 6px;
    }

    .badge {
      margin-top: 0;
    }

    td.p {
      display: grid;
      grid-template-columns: 2.6rem 1fr;
      gap: 8px;
      align-items: baseline;
      margin-top: 4px;
    }

    .inl {
      display: inline-block;
      justify-self: start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shared,
    td.p.D .instr {
      transition: none;
    }
  }
</style>
