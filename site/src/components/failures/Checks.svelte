<script lang="ts">
  import type { Timeline } from '../../lib/timeline';
  import { study, FORM_SHORT, type FormId, type Goal } from '../../lib/study';
  import { gripAt, holdAt, predicatesAt } from '../../lib/failures';

  /** One column per rollout: what the scorer reads from simulator state at tick `i`. */
  type Col = { key: string; head: string; f?: FormId; tl: Timeline | null; i: number };
  let {
    cols,
    goal,
    caption,
    at = null,
  }: { cols: Col[]; goal: Pick<Goal, 'label' | 'moverName' | 'referenceName'>; caption: string; at?: string | null } = $props();

  const S = study.settings.scoring;
  const ROWS = $derived([
    { key: 'relation', label: goal.label, hint: `within ${S.coneDeg}°` },
    { key: 'support', label: 'Target supported by the table', hint: '' },
    { key: 'detached', label: 'Target clear of the gripper', hint: '' },
    { key: 'goal', label: 'Goal met', hint: 'all three' },
    { key: 'hold', label: `Goal met and still for ${S.holdS}\u00a0s`, hint: `under ${S.speedCmS}\u00a0cm/s` },
    { key: 'grip', label: 'Gripper on', hint: 'not scored' },
  ] as const);

  const cells = $derived(
    cols.map((c) => {
      if (!c.tl) return null;
      const p = predicatesAt(c.tl, c.i);
      const h = holdAt(c.tl, c.i);
      const g = gripAt(c.tl, c.i);
      return {
        p,
        h,
        grip: g === 'mover' ? goal.moverName : g === 'reference' ? `the ${goal.referenceName}` : g === 'other' ? 'another object' : 'nothing',
        gcls: g === 'mover' ? 'mover' : g === 'reference' ? 'ref' : g ? 'other' : 'none',
      };
    }),
  );
</script>

<div class="checks">
  <table>
    <caption class="lbl">{caption}{#if at != null}{' '}<span class="t">{at}</span>{/if}</caption>
    <thead>
      <tr>
        <th scope="col"><span class="sr-only">Check</span></th>
        {#each cols as c (c.key)}
          <th scope="col">{#if c.f}<span class="form-pill {c.f}">{FORM_SHORT[c.f]}</span>{:else}{c.head}{/if}{#if c.f}<span class="sr-only"> {c.head}</span>{/if}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each ROWS as r (r.key)}
        <tr class="row-{r.key}">
          <th scope="row">{r.label}{#if r.hint}<span class="hint">{r.hint}</span>{/if}</th>
          {#each cells as c, k (cols[k].key)}
            <td>
              {#if !c}
                <span class="wait">…</span>
              {:else if r.key === 'hold'}
                <span class="hold" class:done={c.h.done}>
                  <span class="bar" aria-hidden="true"><i style:width="{(100 * c.h.held) / c.h.need}%"></i></span>
                  <span class="num">{c.h.done ? 'yes' : `${c.h.held.toFixed(1)}\u00a0s`}</span>
                </span>
              {:else if r.key === 'grip'}
                <span class="grip {c.gcls}">{c.grip}</span>
              {:else}
                {@const ok = c.p[r.key as 'relation' | 'support' | 'detached' | 'goal']}
                <span class="ck" class:ok><svg viewBox="0 0 12 12" aria-hidden="true">
                    {#if ok}<path d="M2.5 6.4 5 8.8 9.6 3.6" />{:else}<path d="M3.2 3.2 8.8 8.8M8.8 3.2 3.2 8.8" />{/if}
                  </svg>{ok ? 'yes' : 'no'}</span
                >
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .checks {
    min-width: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.84rem;
    line-height: 1.35;
    table-layout: fixed;
  }

  caption {
    text-align: left;
    color: var(--stage-muted);
    padding-bottom: 8px;
  }

  caption .t {
    text-transform: none;
    letter-spacing: 0.04em;
    color: var(--stage-ink);
  }

  th,
  td {
    padding: 6px 8px;
    border-top: 1px solid var(--stage-rule);
    vertical-align: middle;
    text-align: left;
  }

  thead th {
    border-top: 0;
    padding-block: 0 6px;
    font-weight: 500;
  }

  thead th:first-child {
    width: 46%;
  }

  tbody th {
    font-weight: 500;
    color: #d5d9e0;
    padding-left: 0;
  }

  .hint {
    display: block;
    font-weight: 400;
    font-size: 0.74rem;
    color: var(--stage-muted);
  }

  tr.row-goal th,
  tr.row-goal td {
    border-top-color: #4a505b;
  }

  .ck {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--stage-muted);
    white-space: nowrap;
  }

  .ck svg {
    flex: none;
    width: 16px;
    height: 16px;
    padding: 2px;
    border-radius: 50%;
    background: rgb(255 255 255 / 7%);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ck.ok {
    color: var(--kept-2);
  }

  .ck.ok svg {
    background: rgb(111 211 154 / 14%);
  }

  tr.row-goal .ck {
    font-weight: 600;
  }

  .hold {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    color: var(--stage-muted);
    white-space: nowrap;
  }

  .hold.done {
    color: var(--kept-2);
    font-weight: 600;
  }

  .bar {
    position: relative;
    display: block;
    flex: none;
    width: 34px;
    height: 6px;
    border-radius: 3px;
    background: rgb(255 255 255 / 10%);
    overflow: hidden;
  }

  .bar i {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--kept-2);
  }

  .grip {
    color: var(--stage-muted);
  }

  .grip.mover {
    color: var(--mover-2);
  }

  .grip.ref {
    color: var(--ref-2);
    font-weight: 600;
  }

  .grip.other {
    color: var(--lost-2);
  }

  .wait {
    color: var(--stage-muted);
  }
</style>
