<script lang="ts">
  import { loadTimeline, type Timeline } from '../../lib/timeline';
  import { epFile } from '../../lib/media';
  import { study, MODEL_SHORT, MODEL_NAME } from '../../lib/study';
  import Instruction from '../Instruction.svelte';
  import Executed from './Executed.svelte';
  import Composite from './Composite.svelte';
  import {
    GOAL_INFO,
    FORM_SHORT,
    FORM_NAME,
    FC_FIELDS,
    DREAM,
    EVENT_LABEL,
    HZ,
    verdict,
    sec,
    type Rec,
  } from '../../lib/explore';

  let {
    rec,
    starts,
    where,
    prev,
    next,
    onnav,
    oncompare,
    onclose,
  }: {
    rec: Rec;
    starts: number;
    /** Position in the current filtered order ("12 of 288"), or a note when the rollout is outside the filters. */
    where: string;
    prev: string | null;
    next: string | null;
    onnav: (id: string) => void;
    oncompare: (row: string) => void;
    onclose: () => void;
  } = $props();

  type Tab = 'exec' | 'fc' | 'dream';
  let tab = $state<Tab>('exec');
  const e = $derived(rec.e);
  const goal = $derived(rec.goal);
  const info = $derived(GOAL_INFO[goal.key]);
  const v = $derived(verdict(e));
  const hasDream = $derived(DREAM.has(e.id));
  const tabs = $derived<{ k: Tab; label: string; short: string }[]>([
    { k: 'exec', label: 'Executed', short: 'Executed' },
    { k: 'fc', label: 'Forecast', short: 'Forecast' },
    ...(hasDream ? [{ k: 'dream' as Tab, label: 'Whole-episode forecast', short: 'Whole episode' }] : []),
  ]);
  $effect(() => {
    if (tab === 'dream' && !hasDream) tab = 'exec';
  });

  let tl = $state.raw<Timeline | null>(null);
  $effect(() => {
    const id = e.id;
    tl = null;
    loadTimeline(id)
      .then((x) => {
        if (x.id === e.id) tl = x;
      })
      .catch(() => {});
  });

  const sel = study.forecast.reported.selection;
  const evd = study.forecast.reported.events;
  const annot: string[] = study.forecast.reported.annotators.map((a: string) => a.replace(/-(?:A\d+B-)?(?:Instruct-)?FP8$/, ''));
  const nreq = $derived(tl?.requests.length ?? null);

  function tabKey(ev: KeyboardEvent) {
    const k = tabs.findIndex((t) => t.k === tab);
    let j = -1;
    if (ev.key === 'ArrowRight') j = (k + 1) % tabs.length;
    else if (ev.key === 'ArrowLeft') j = (k - 1 + tabs.length) % tabs.length;
    else if (ev.key === 'Home') j = 0;
    else if (ev.key === 'End') j = tabs.length - 1;
    if (j < 0) return;
    ev.preventDefault();
    tab = tabs[j].k;
    document.getElementById(`ex-tab-${tab}`)?.focus();
  }

  $effect(() => {
    const on = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest('input, select, textarea, [role=slider], [role=tablist], [role=group]')) return;
      if (ev.key === 'ArrowLeft' && prev) {
        ev.preventDefault();
        onnav(prev);
      } else if (ev.key === 'ArrowRight' && next) {
        ev.preventDefault();
        onnav(next);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });
</script>

<article class="player" aria-labelledby="ex-title">
  <header class="ph">
    <div class="pt">
      <h2 id="ex-title">
        <span class="form-pill {e.f}">{FORM_SHORT[e.f]}</span>
        <span class="g"><span class="tok-mover">{info.parts.mover}</span> {info.parts.rel} <span class="tok-ref">{info.parts.ref}</span></span>
      </h2>
      <p class="meta">
        <span title={MODEL_NAME[e.m]}>{MODEL_SHORT[e.m]}</span><span aria-hidden="true">·</span><span>Start {e.c} of {starts}</span><span
          aria-hidden="true">·</span
        ><span>{FORM_NAME[e.f]} wording</span><span aria-hidden="true">·</span><span class="mono id">{e.id}</span>
      </p>
    </div>
    <div class="acts">
      <div class="nav" role="group" aria-label="Rollouts in the current order">
        <button type="button" class="ib" disabled={!prev} onclick={() => prev && onnav(prev)} aria-label="Previous rollout">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </button>
        <span class="pos num">{where}</span>
        <button type="button" class="ib" disabled={!next} onclick={() => next && onnav(next)} aria-label="Next rollout">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      </div>
      <button type="button" class="cmpb" onclick={() => oncompare(rec.row)}>
        <svg viewBox="0 0 20 14" aria-hidden="true"
          ><rect x="0.75" y="0.75" width="5" height="12.5" rx="1.4" /><rect x="7.5" y="0.75" width="5" height="12.5" rx="1.4" /><rect
            x="14.25"
            y="0.75"
            width="5"
            height="12.5"
            rx="1.4"
          /></svg
        >
        Compare wordings
      </button>
      <button type="button" class="ib x" onclick={onclose} aria-label="Close" data-autofocus>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
      </button>
    </div>
  </header>

  <div class="body">
    <div class="lead">
      <p class="q">“<Instruction prompt={goal.prompts[e.f]} {goal} />”</p>
      <span class="status {v.cls}">{v.text}</span>
    </div>

    <div class="tabs" role="tablist" aria-label="Views of this rollout">
      {#each tabs as t (t.k)}
        <button
          type="button"
          role="tab"
          id="ex-tab-{t.k}"
          aria-selected={tab === t.k}
          aria-controls="ex-panel"
          tabindex={tab === t.k ? 0 : -1}
          onclick={() => (tab = t.k)}
          onkeydown={tabKey}
          ><span class="tl">{t.label}</span><span class="ts" aria-hidden="true">{t.short}</span></button
        >
      {/each}
    </div>

    <div class="panel" role="tabpanel" id="ex-panel" aria-labelledby="ex-tab-{tab}">
      {#key `${e.id}-${tab}`}
        {#if tab === 'exec'}
          <Executed {rec} {tl} />
        {:else if tab === 'fc'}
          <div class="fc">
            <Composite
              src={epFile(e.id, 'forecast.mp4')}
              left="Generated prediction"
              right="Executed"
              label="Generated prediction beside the executed rollout, primary forecast window"
              rate={0.5}
              offset={e.pre / HZ}
            />
            <div class="fcinfo">
              <p class="small">
                Prediction {e.pr + 1}{#if nreq}{' '}of {nreq}{/if}, made at {sec(e.pre / HZ)}; covers up to {sel.actions} actions at {sel.hz}&nbsp;Hz
                (until {sec((e.pre + e.nx) / HZ)}).
                {#if e.fallback}This rollout never brought the gripper within {sel.gripperCm}&nbsp;cm of a movable task object, so its first prediction
                  is shown.{:else}It is the first prediction made with the gripper within {sel.gripperCm}&nbsp;cm of a movable task object.{/if}
              </p>
              <h3 class="h">What the annotators read in the prediction</h3>
              {#if e.fc}
                {@const fc = e.fc}
                <dl class="labels">
                  {#each FC_FIELDS as f (f.key)}
                    <div><dt>{f.label}</dt><dd>{f.values[fc[f.key]] ?? fc[f.key]}</dd></div>
                  {/each}
                </dl>
              {:else}
                <p class="small">No labels were recorded for this prediction.</p>
              {/if}
              <p class="cav">
                Labels from {annot.join(' and ')} after resolving disagreements. They are model-generated and unverified.
              </p>
              <h3 class="h">Detected error in the executed window</h3>
              <p class="evl"><span class="evtag" class:on={rec.v.ev !== 'none'}>{rec.v.ev === 'none' ? 'None detected' : EVENT_LABEL[rec.v.ev]}</span></p>
              <p class="cav">
                Wrong object: at least {evd.contactS}&nbsp;s of continuous contact with a non-target object that moves it {evd.displacementCm}&nbsp;cm
                or more. Contradictory release: after contact, the target rests at least {evd.supportedS}&nbsp;s supported and detached in exactly one
                other registered relation while the requested one is false. Detected from simulator state; not all visually verified.
              </p>
            </div>
          </div>
        {:else}
          <div class="dream">
            <Composite
              src={epFile(e.id, 'dream.mp4')}
              left="Generated predictions"
              right="Executed"
              label="The model's predictions over the whole episode beside the executed rollout"
              rate={2}
              {tl}
              stableAt={e.se ? e.tStableDone : null}
            />
            <p class="cav">
              Each moment shows the latest prediction the model had made. Black frames mean the model exposed no decodable future at that time; they are
              missing evidence, never a zero or a failure.
            </p>
          </div>
        {/if}
      {/key}
    </div>
  </div>
</article>

<style>
  .player {
    container: player / inline-size;
    min-height: 100%;
  }

  .ph {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 18px;
    padding: 14px 20px;
    background: rgb(13 15 19 / 94%);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--stage-rule);
  }

  .pt {
    min-width: 0;
    flex: 1 1 340px;
  }

  h2 {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: clamp(1.15rem, 1rem + 0.6vw, 1.45rem);
    line-height: 1.25;
    color: #fff;
  }

  h2 .form-pill {
    position: relative;
    top: -0.15em;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 7px;
    margin: 5px 0 0;
    font-size: 0.78rem;
    color: var(--stage-muted);
    line-height: 1.35;
  }

  .id {
    font-size: 0.72rem;
  }

  .acts {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .nav {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .pos {
    min-width: 6.5em;
    text-align: center;
    font-size: 0.78rem;
    color: var(--stage-muted);
    white-space: nowrap;
  }

  .ib {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--stage-rule);
    border-radius: 10px;
    background: var(--stage-2);
    color: var(--stage-ink);
    cursor: pointer;
  }

  .ib:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .ib:not(:disabled):hover {
    border-color: var(--stage-muted);
  }

  .ib svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .cmpb {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    background: #fff;
    color: var(--ink);
    font-size: 0.84rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .cmpb svg {
    width: 17px;
    height: 12px;
  }

  .cmpb rect {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }

  .body {
    display: grid;
    gap: 16px;
    padding: 16px 20px 24px;
  }

  .lead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }

  .q {
    margin: 0;
    font-family: var(--serif);
    font-size: 1.15rem;
    line-height: 1.4;
    color: #d5d9e0;
  }

  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--stage-rule);
  }

  [role='tab'] {
    position: relative;
    padding: 8px 12px 10px;
    border: 0;
    background: none;
    color: var(--stage-muted);
    font-size: 0.86rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  [role='tab'][aria-selected='true'] {
    color: #fff;
  }

  [role='tab'][aria-selected='true']::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: -1px;
    height: 2px;
    border-radius: 2px;
    background: var(--tf-2);
  }

  .ts {
    display: none;
  }

  .fc {
    display: grid;
    gap: 18px;
  }

  .fcinfo {
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .small,
  .cav {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--stage-muted);
    max-width: 46em;
  }

  .h {
    margin: 6px 0 0;
    font-family: var(--sans);
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--stage-ink);
  }

  .labels {
    margin: 0;
    display: grid;
    border-top: 1px solid var(--stage-rule);
  }

  .labels div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid var(--stage-rule);
    font-size: 0.82rem;
    line-height: 1.3;
  }

  .labels dt {
    color: var(--stage-muted);
  }

  .labels dd {
    margin: 0;
    text-align: right;
  }

  .evl {
    margin: 0;
  }

  .evtag {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 7px;
    border: 1px solid var(--stage-rule);
    font-size: 0.82rem;
    color: var(--stage-muted);
  }

  .evtag.on {
    color: var(--lost-2);
    border-color: color-mix(in srgb, var(--lost-2) 45%, transparent);
  }

  .dream {
    display: grid;
    gap: 12px;
  }

  @container player (min-width: 980px) {
    .fc {
      grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
      align-items: start;
    }
  }

  @container player (max-width: 560px) {
    .ph {
      padding: 12px 14px;
    }

    .body {
      padding: 14px 14px 22px;
    }

    .pt {
      padding-right: 46px;
    }

    .x {
      position: absolute;
      top: 12px;
      right: 14px;
    }

    .tl {
      display: none;
    }

    .ts {
      display: inline;
    }
  }
</style>
