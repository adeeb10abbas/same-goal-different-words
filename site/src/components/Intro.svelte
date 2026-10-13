<script lang="ts">
  import { onDestroy } from 'svelte';
  import SyncVideo from './SyncVideo.svelte';
  import Instruction from './Instruction.svelte';
  import CountUp from './CountUp.svelte';
  import { createClock, autoplay } from '../lib/clock.svelte';
  import { onVisible, reducedMotion } from '../lib/sync';
  import { epFile, href, type Episode } from '../lib/media';
  import { study, MODELS, GOALS, SCENES, FORM_ORDER, FORM_NAME, FORM_SHORT, goalByKey, type FormId } from '../lib/study';

  /** The target-first rollout shown in the hero: its camera inputs, one of its forecasts and its goal anchor the introduction. */
  let { rollout }: { rollout: Episode } = $props();

  const uid = $props.id();
  // svelte-ignore state_referenced_locally
  const ep = rollout;
  const goal = goalByKey(`${ep.s}-${ep.g}`);
  if (goal.key !== 'S4-R' || ep.f !== 'S') throw new Error('Intro: the overlay geometry assumes the mustard-right target-first rollout');

  const APR = study.settings.actionsPerRequest;
  const HZ = study.settings.hz;
  const STARTS = study.settings.stats.starts / SCENES.length;
  const TOTAL = study.flow.total;
  if (MODELS.length * GOALS.length * FORM_ORDER.length * STARTS !== TOTAL) throw new Error('Intro: design does not multiply to the episode count');
  const SECS = [Math.min(...SCENES.map((s) => s.seconds)), Math.max(...SCENES.map((s) => s.seconds))];
  const askedAt = (ep.pre / HZ).toFixed(1);
  const span = (APR / HZ).toFixed(1);
  const camBase = `vqa/${ep.s}-C${String(ep.c).padStart(2, '0')}`;

  /* ── Figure 1: one step of the control loop ─────────────────────────────── */
  const { clock, state: play, destroy } = createClock(1, 900);
  onDestroy(destroy);
  let userPaused = $state(false);
  const GEN: [number, number, number, number, number, number] = [0, 0, 640, 540, 1280, 540];
  const step = $derived(Math.min(APR, Math.floor(play.t * HZ) + 1));
  const ticking = $derived(play.playing || play.t > 0);
  function toggle() {
    clock.toggle();
    userPaused = !clock.playing;
  }

  let shown = $state(true);
  // The play/pause badge appears only once hydrated: without JavaScript the browser shows its own video controls there.
  let live = $state(false);
  function reveal(node: HTMLElement) {
    live = true;
    if (reducedMotion()) return;
    let first = true;
    return onVisible(
      node,
      (v) => {
        if (first) {
          first = false;
          if (!v) shown = false;
          return;
        }
        if (v) shown = true;
      },
      0.2,
    );
  }

  /* ── Figure 2: the paper's Table 1, one goal described three ways ──────── */
  // Close view of the exterior camera (536×540), cropped to the robot base and both objects. Pixel boxes were read off this
  // still; the camera faces the robot, so the goal (mustard to the robot's right of the box) lies to the image left of the box.
  const CROP = [160, 185, 260, 210] as const;
  const crop = `position:absolute;width:${(536 / CROP[2]) * 100}%;height:${(540 / CROP[3]) * 100}%;left:${(-CROP[0] / CROP[2]) * 100}%;top:${(-CROP[1] / CROP[3]) * 100}%;max-width:none`;

  const CLAUSE: Record<FormId, { lead: string; subject: 'mover' | 'ref'; rel: string; object: 'mover' | 'ref' }> = {
    D: { lead: 'Command', subject: 'mover', rel: 'to the right of', object: 'ref' },
    S: { lead: 'After “so that”', subject: 'mover', rel: 'is to the right of', object: 'ref' },
    I: { lead: 'After “so that”', subject: 'ref', rel: 'is to the left of', object: 'mover' },
  };
  const NAMES = { mover: goal.moverName, ref: goal.referenceName };

  let form = $state<FormId>('D');
  // Starts once the figure hydrates, so readers without JavaScript or with reduced motion never see a pause control.
  let cycling = $state(false);
  let hold = $state(false);
  const clause = $derived(CLAUSE[form]);

  function pick(f: FormId) {
    form = f;
    cycling = false;
  }

  function cycle(node: HTMLElement) {
    if (reducedMotion()) return;
    cycling = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let visible = false;
    let steps = 0;
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = setInterval(() => {
        if (!cycling || hold || !visible) return;
        form = FORM_ORDER[(FORM_ORDER.indexOf(form) + 1) % FORM_ORDER.length];
        if (++steps >= FORM_ORDER.length * 3) cycling = false;
      }, 3200);
    };
    const off = onVisible(
      node,
      (v) => {
        visible = v;
        if (v) start();
        else stop();
      },
      0.2,
    );
    return () => {
      stop();
      off();
    };
  }

  /* ── Related work and roadmap ──────────────────────────────────────────── */
  type Ref = { label: string; url?: string };
  const PRIOR: { tag: string; title: string; body: string; refs: Ref[] }[] = [
    {
      tag: 'Evaluation',
      title: 'Language in look-alike scenes',
      body: 'Whether policies respond to language when scenes are visually similar.',
      refs: [{ label: 'TRI LBM Team, 2025', url: 'https://arxiv.org/abs/2507.05331' }],
    },
    {
      tag: 'Evaluation',
      title: 'Changed goals',
      body: 'Whether policies follow a goal that differs from the one the scene suggests.',
      refs: [{ label: 'Fang et al., 2026', url: 'https://arxiv.org/abs/2602.17659' }],
    },
    {
      tag: 'Robustness',
      title: 'Paraphrases and irrelevant context',
      body: 'Whether policies withstand reworded instructions and distracting additions.',
      refs: [
        { label: 'LIBERO-Plus, Fei et al., 2026' },
        { label: 'LIBERO-Para, Kim et al., 2026', url: 'https://arxiv.org/abs/2603.28301' },
        { label: 'Moskalenko et al., 2026', url: 'https://aclanthology.org/2026.eacl-srw.63/' },
      ],
    },
    {
      tag: 'Methods',
      title: 'Better instruction following',
      body: 'Counterfactual supervision and semantic guidance to make policies follow instructions.',
      refs: [
        { label: 'CAST, Glossop et al., 2025', url: 'https://arxiv.org/abs/2508.13446' },
        { label: 'SG-WAM, He et al., 2026', url: 'https://arxiv.org/abs/2608.08839' },
      ],
    },
  ];

  const ROADMAP = [
    { to: 'finding', n: '02', name: 'The finding', q: 'Does naming the reference first change how often the robot reaches the goal?' },
    { to: 'setup', n: '03', name: 'Setup', q: 'How do we change the words and nothing else?' },
    { to: 'results', n: '04', name: 'Results', q: 'Does the gap hold for every relation, or can an average hide it?' },
    { to: 'failures', n: '05', name: 'Failures', q: 'When the relation comes true, did the robot do what it was asked?' },
    { to: 'language', n: '06', name: 'Interpreting the goal', q: 'Do the models’ language backbones read the goal correctly?' },
    { to: 'forecasts', n: '07', name: 'Forecasts', q: 'Do the models’ imagined futures warn of their mistakes?' },
    { to: 'takeaways', n: '08', name: 'Takeaways', q: 'What should an evaluation of world-action models check?' },
  ];

  const word = (n: number) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? String(n);
  const DESIGN = [
    { n: MODELS.length, what: 'world-action models', note: MODELS.map((m) => m.short).join(' · ') },
    { n: GOALS.length, what: 'placement goals', note: `in ${word(SCENES.length)} RoboLab scenes` },
    { n: FORM_ORDER.length, what: 'wordings per goal', note: FORM_ORDER.map((f) => FORM_SHORT[f]).join(' · ') },
    { n: STARTS, what: 'starts per scene', note: 'identical for every wording' },
  ];
</script>

<section class="section alt opening" id="intro">
  <div class="wrap">
    <header class="intro">
      <div class="eyebrow">01 · Introduction</div>
      <h2>Equivalent instructions should lead to the same manipulation</h2>
      <p class="lede">
        <span class="nw">World-action</span> models (WAMs) generate robot actions together with predictions of future observations. Their
        usefulness as general-purpose policies depends on turning a user’s description into the intended manipulation. For a spatial
        placement, that means identifying both the <span class="tok-mover">object to move</span> and its destination, which is fixed relative
        to a <span class="tok-ref">reference</span> object.
      </p>
    </header>

    <!-- Figure 1 -->
    <figure class="fig wam" class:shown {@attach reveal} {@attach autoplay(clock, () => !userPaused, 0.3)}>
      <div class="wam-grid">
        <div class="col in">
          <div class="col-h">Inputs</div>
          <div class="node instr">
            <span class="node-h">Instruction</span>
            <p class="say">“<Instruction prompt={goal.prompts.S} {goal} />”</p>
            <a class="probe" href="#setup-instructions"><span>Three wordings per goal</span><span class="sec">03 →</span></a>
          </div>
          <div class="node camsn">
            <span class="node-h">Three cameras</span>
            <div class="cams">
              <figure class="cam wide">
                <img src={href(`${camBase}-wrist.webp`)} width="640" height="360" alt="Wrist camera: the raisin box and the mustard bottle on the table, gripper below" loading="lazy" decoding="async" />
                <figcaption data-qa-overlay>wrist</figcaption>
              </figure>
              <figure class="cam">
                <img src={href(`${camBase}-left.webp`)} width="640" height="360" alt="Left exterior camera" loading="lazy" decoding="async" />
                <figcaption data-qa-overlay>left</figcaption>
              </figure>
              <figure class="cam">
                <img src={href(`${camBase}-right.webp`)} width="640" height="360" alt="Right exterior camera" loading="lazy" decoding="async" />
                <figcaption data-qa-overlay>right</figcaption>
              </figure>
            </div>
          </div>
          <div class="node row state">
            <svg class="arm" viewBox="0 0 32 32" aria-hidden="true"
              ><path d="M5 28h12M11 28V20l7-8 7 4" /><circle cx="11" cy="20" r="2" /><circle cx="18" cy="12" r="2" /><path d="M25 16l3 3m-3-3l-1 4" /></svg
            >
            <span><span class="node-h">Robot state</span><span class="small">Where the arm and gripper are</span></span>
          </div>
        </div>

        <div class="flow" aria-hidden="true"><i></i></div>

        <div class="col model">
          <div class="col-h">World-action model</div>
          <div class="brain">
            <div class="brain-h">World-action model</div>
            <div class="part">
              <b>Vision–language backbone</b>
              <span>Interprets the instruction. FLUX uses its backbone as a text encoder only.</span>
              <a class="probe" href="#language"><span>Tested on its own</span><span class="sec">06 →</span></a>
            </div>
            <div class="inner" aria-hidden="true"><i></i></div>
            <div class="part">
              <b>Generator</b>
              <span>From the instruction, the cameras and the robot state, predicts the next frames and the next {APR} actions together.</span>
            </div>
            <ul class="who" aria-label="Models evaluated">
              {#each MODELS as m (m.id)}
                <li><span class="mn">{m.name}</span><span class="lm">{m.lm}</span></li>
              {/each}
            </ul>
          </div>
        </div>

        <div class="flow" aria-hidden="true"><i></i></div>

        <div class="col out">
          <div class="col-h">Outputs</div>
          <div class="node future">
            <span class="node-h">Predicted future <span class="gen">generated</span></span>
            <button
              type="button"
              class="vid"
              onclick={toggle}
              aria-label={play.playing ? 'Pause the predicted future' : 'Play the predicted future'}
            >
              <SyncVideo
                {clock}
                src={epFile(ep.id, 'forecast.mp4')}
                crop={GEN}
                label="Generated forecast: wrist camera above two exterior cameras"
              />
              {#if live}<span class="pp" aria-hidden="true" data-qa-overlay>{play.playing ? '❚❚' : '▶'}</span>{/if}
            </button>
            <a class="probe" href="#forecasts"><span>Do forecasts warn of mistakes?</span><span class="sec">07 →</span></a>
          </div>
          <div class="node acts">
            <span class="node-h">Actions</span>
            <svg class="chunk" viewBox="0 0 {APR * 10 - 3} 22" preserveAspectRatio="none" aria-hidden="true">
              {#each { length: APR } as _, i}
                <rect x={i * 10} y="0" width="7" height="22" rx="2" class:lit={!ticking || i < step} />
              {/each}
            </svg>
            <span class="small">{APR} actions at {HZ}&nbsp;Hz, about {span}&nbsp;s of motion</span>
            <a class="probe" href="#results"><span>Scored for stable placement</span><span class="sec">04 →</span></a>
          </div>
        </div>

        <div class="loop a" aria-hidden="true"></div>
        <div class="loop b" aria-hidden="true"></div>
        <div class="loop c" aria-hidden="true"></div>
        <p class="loop-t">
          <span class="ic" aria-hidden="true">↺</span> The robot executes the actions, the cameras and state update, and the model is asked again,
          with the same instruction, until the episode ends.
        </p>
      </div>
      <figcaption class="caption">
        One step of the control loop, for the target-first rollout at the top of the page. The cameras show the scene before the robot moves.
        The predicted future is the forecast Cosmos3 Edge generated {askedAt}&nbsp;s into that rollout, wrist view above the two exterior
        views; it spans the same {span}&nbsp;s as the actions returned with it. Select it to pause.
      </figcaption>
    </figure>

    <!-- Figure 2 -->
    <div class="sub" id="intro-roles">
      <h3>One goal, three ways to say it</h3>
      <p>
        A placement goal names two objects: the <span class="tok-mover">target</span> to move and the <span class="tok-ref">reference</span> that
        fixes where it goes. The same arrangement can be stated from either side, because the mustard is to the right of the raisin box exactly
        when the box is to the left of the mustard. We therefore write every goal three ways and run each from the same start.
      </p>
    </div>

    <figure class="fig roles" {@attach cycle}>
      <div class="scene">
        <div class="shot" style:aspect-ratio="{CROP[2]} / {CROP[3]}">
          <img
            src={epFile(ep.id, 'first.webp')}
            width="536"
            height="540"
            style={crop}
            alt="Initial scene seen from across the table: the robot at the back, a raisin box, and the mustard bottle on the robot’s left of the box"
            loading="lazy"
            decoding="async"
          />
          <svg class="ov" viewBox="{CROP[0]} {CROP[1]} {CROP[2]} {CROP[3]}" aria-hidden="true">
            <defs>
              <marker id="{uid}-ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="var(--mover)" />
              </marker>
            </defs>
            <rect class="ghost" x="216" y="313" width="34" height="62" rx="14" />
            <path class="halo" d="M347 306C334 258 250 258 236 300" />
            <path class="move" d="M347 306C334 258 250 258 236 300" marker-end="url(#{uid}-ah)" />
            <rect class="ring ref" class:subj={clause.subject === 'ref'} x="270" y="326" width="40" height="47" rx="7" />
            <rect class="ring mover" class:subj={clause.subject === 'mover'} x="330" y="313" width="34" height="62" rx="14" />
          </svg>
        </div>
        <div class="axis" aria-hidden="true"><span>← robot’s right</span><span>robot’s left →</span></div>
        <ul class="legend">
          <li><i class="sw mover"></i><span><b class="tok-mover">mustard bottle</b> target, the object to move</span></li>
          <li><i class="sw ref"></i><span><b class="tok-ref">raisin box</b> reference</span></li>
          <li><i class="sw ghost"></i><span>goal: mustard to the right of the box, in the robot’s frame</span></li>
        </ul>
      </div>

      <div class="words">
        <div class="wh">
          <span class="lbl">Instruction</span>
          {#if cycling}
            <button type="button" class="stopper" onclick={() => (cycling = false)} aria-label="Pause cycling through the wordings"
              ><span aria-hidden="true">❚❚</span> Pause</button
            >
          {/if}
        </div>
        <div
          class="opts"
          role="group"
          aria-label="Wording"
          onpointerenter={() => (hold = true)}
          onpointerleave={() => (hold = false)}
          onfocusin={() => (hold = true)}
          onfocusout={() => (hold = false)}
        >
          {#each FORM_ORDER as f (f)}
            <button type="button" class="opt {f}" aria-pressed={form === f} onclick={() => pick(f)}>
              <span class="oh"><span class="form-pill {f}">{FORM_SHORT[f]}</span><span class="fname">{FORM_NAME[f]}</span></span>
              <span class="ot">“<Instruction prompt={goal.prompts[f]} {goal} />”</span>
            </button>
          {/each}
        </div>
        <p class="readout">
          <span class="rl">{clause.lead}</span>
          <span class="rs"
            ><b class="tok-{clause.subject}">{NAMES[clause.subject]}</b> {clause.rel} <b class="tok-{clause.object}">{NAMES[clause.object]}</b
            ></span
          >
        </p>
        <p class="same"><span class="ok" aria-hidden="true">✓</span> Same goal, same start, and the robot is asked to move the mustard every time.</p>
      </div>
      <figcaption class="caption">
        The paper’s Table&nbsp;1. Direct (DIR) is a concise command. Target-first (TF) and reference-first (RF) differ in the subject of the
        spatial clause: TF describes the mustard relative to the box, RF the box relative to the mustard. Close view of the exterior camera,
        rotated 90° as in the paper; the camera faces the robot, so image left is the robot’s right.
      </figcaption>
    </figure>

    <!-- The question -->
    <div class="sub" id="intro-question">
      <h3>The question</h3>
    </div>
    <blockquote class="ask">
      <p>Does the policy respond consistently to equivalent language instructions?</p>
    </blockquote>
    <div class="sub tight-top">
      <p>
        Prior work asks neighbouring questions. We focus on a specific consistency requirement: preserving the intended manipulation when the
        same spatial goal is described from another object’s perspective.
      </p>
    </div>
    <ul class="prior">
      {#each PRIOR as p (p.title)}
        <li class="pc">
          <span class="tag">{p.tag}</span>
          <h4>{p.title}</h4>
          <p>{p.body}</p>
          <ul class="refs">
            {#each p.refs as r (r.label)}
              <li>{#if r.url}<a href={r.url}>{r.label}</a>{:else}{r.label}{/if}</li>
            {/each}
          </ul>
        </li>
      {/each}
      <li class="pc ours">
        <span class="tag">This study</span>
        <h4>The same spatial goal, described from another object’s perspective</h4>
        <p>
          Target-first and reference-first describe one arrangement from opposite objects. A consistent policy should move the same object to
          the same place under both.
        </p>
      </li>
    </ul>

    <!-- What we did -->
    <div class="sub" id="intro-design">
      <h3>What we did</h3>
      <p>
        We compare three released WAMs under alternative instructions from identical initial scenes. Success under one description does not
        imply consistency across equivalent descriptions, and opposite effects across spatial relations can cancel in an overall score. The
        rollouts also show a limit of spatial scoring: the requested relation can become true because the wrong object moved, or disappear under
        continued control. To separate language understanding from action generation, we also test each model’s vision–language backbone on
        its own.
      </p>
    </div>
    <div class="eq">
      {#each DESIGN as d, i (d.what)}
        <div class="term" class:first={i === 0} aria-hidden="true">
          <span class="op">×</span>
          <span class="n num">{d.n}</span>
          <span class="w">{d.what}</span>
          <span class="nt">{d.note}</span>
        </div>
      {/each}
      <div class="term total" aria-hidden="true">
        <span class="op">=</span>
        <span class="n num"><CountUp value={TOTAL} duration={1300} /></span>
        <span class="w">paired rollouts</span>
        <span class="nt">{SECS[0]}–{SECS[1]}&nbsp;s each, every one on video</span>
      </div>
      <p class="sr-only">
        {DESIGN.map((d) => `${d.n} ${d.what}`).join(' times ')} equals {TOTAL} paired rollouts, {SECS[0]} to {SECS[1]} seconds each, every one
        on video.
      </p>
    </div>

    <nav class="roadmap" aria-labelledby="intro-roadmap">
      <h3 id="intro-roadmap" class="rh">What the rest of this page asks</h3>
      <ol>
        {#each ROADMAP as r (r.to)}
          <li>
            <a href="#{r.to}">
              <span class="rn num">{r.n}</span>
              <span class="rb"><span class="rname">{r.name}</span><span class="rq">{r.q}</span></span>
              <span class="ra" aria-hidden="true">→</span>
            </a>
          </li>
        {/each}
      </ol>
    </nav>
  </div>
</section>

<style>
  /* ── Figure 1 ──────────────────────────────────────────────────────────── */
  .wam,
  .roles {
    margin-inline: 0;
  }

  .wam {
    padding: clamp(16px, 2.4vw, 30px);
  }

  .wam-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 46px minmax(0, 0.92fr) 46px minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    align-items: stretch;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    transition:
      opacity 0.8s var(--ease),
      transform 0.8s var(--ease);
  }

  .col.model {
    transition-delay: 0.25s;
  }

  .col.out {
    transition-delay: 0.5s;
  }

  .wam:not(.shown) .col {
    opacity: 0;
    transform: translateY(14px);
  }

  .col-h {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .node {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 13px;
    border: 1px solid var(--rule);
    border-radius: 12px;
    background: var(--paper);
    min-width: 0;
  }

  .node.row {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .node-h {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink);
  }

  .small {
    display: block;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--muted);
  }

  .say {
    margin: 0;
    font-family: var(--serif);
    font-size: 1.02rem;
    line-height: 1.45;
    color: var(--ink-2);
  }

  .say :global(.tok-mover),
  .say :global(.tok-ref),
  .ot :global(.tok-mover),
  .ot :global(.tok-ref) {
    white-space: normal;
  }

  .probe {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    margin-top: 2px;
    font-size: 0.76rem;
    line-height: 1.35;
    color: var(--mover-ink);
    text-decoration: none;
  }

  .probe:hover span:first-child {
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }

  .probe .sec {
    font-family: var(--mono);
    font-size: 0.7rem;
    white-space: nowrap;
  }

  .cams {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--stage);
  }

  .cam {
    position: relative;
    margin: 0;
    aspect-ratio: 16 / 9;
    overflow: hidden;
  }

  .cam.wide {
    grid-column: 1 / -1;
  }

  .cam img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cam figcaption,
  .gen {
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    line-height: 1;
    padding: 3px 5px;
    border-radius: 4px;
  }

  .cam figcaption {
    position: absolute;
    left: 5px;
    bottom: 5px;
    color: #fff;
    background: rgb(13 15 19 / 72%);
  }

  .gen {
    font-weight: 500;
    color: var(--stage-ink);
    background: var(--stage-3);
    text-transform: uppercase;
  }

  .arm {
    width: 30px;
    height: 30px;
    flex: none;
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .arm circle {
    fill: var(--paper);
  }

  /* Flow arrows between the columns. */
  .flow {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 22px;
  }

  .flow i,
  .inner i {
    position: relative;
    display: block;
    background: repeating-linear-gradient(90deg, var(--mover) 0 6px, transparent 6px 11px);
    background-size: 22px 100%;
  }

  .flow i {
    width: 100%;
    height: 2px;
    margin-right: 6px;
  }

  .flow i::after,
  .inner i::after {
    content: '';
    position: absolute;
    border: 6px solid transparent;
  }

  .flow i::after {
    right: -9px;
    top: -5px;
    border-left: 8px solid var(--mover);
    border-right: 0;
  }

  .wam.shown .flow i,
  .wam.shown .inner i {
    animation: flow 1.1s linear infinite;
  }

  @keyframes flow {
    to {
      background-position: 22px 0;
    }
  }

  /* The model itself. */
  .brain {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    padding: 14px;
    border-radius: 14px;
    background: var(--stage);
    color: var(--stage-ink);
    box-shadow: 0 10px 30px -14px rgb(13 15 19 / 55%);
  }

  .part {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 11px 12px;
    border: 1px solid var(--stage-rule);
    border-radius: 10px;
    background: var(--stage-2);
  }

  .part b {
    font-family: var(--serif);
    font-weight: 500;
    font-size: 1.12rem;
    line-height: 1.2;
  }

  .part > span {
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--stage-muted);
  }

  .part .probe {
    color: var(--mover-2);
  }

  .inner {
    display: flex;
    justify-content: center;
    height: 26px;
  }

  .inner i {
    width: 2px;
    height: 100%;
    background: repeating-linear-gradient(180deg, var(--mover-2) 0 6px, transparent 6px 11px);
    background-size: 100% 22px;
    margin-bottom: 6px;
    height: calc(100% - 6px);
  }

  .inner i::after {
    bottom: -12px;
    left: -5px;
    border-top: 8px solid var(--mover-2);
    border-bottom: 0;
  }

  .wam.shown .inner i {
    animation-name: flow-v;
  }

  @keyframes flow-v {
    to {
      background-position: 0 22px;
    }
  }

  .who {
    list-style: none;
    margin: auto 0 0;
    padding: 12px 2px 0;
    border-top: 1px solid var(--stage-rule);
    display: grid;
    gap: 7px;
  }

  .brain-h {
    display: none;
  }

  /* Desktop: the model sits centred between the arrows and carries its own label,
     so the column headers stay aligned without a stretched, half-empty card. */
  @media (min-width: 1000px) {
    .col.model > .col-h {
      display: none;
    }

    .brain {
      flex: none;
      margin-block: auto;
    }

    .brain-h {
      display: block;
      margin: 2px 2px 12px;
      font-family: var(--mono);
      font-size: 0.7rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--stage-muted);
    }

    .brain > .part:last-of-type {
      margin-bottom: 14px;
    }
  }

  .who li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 2px 10px;
  }

  .mn {
    font-size: 0.86rem;
    font-weight: 600;
  }

  .lm {
    font-family: var(--mono);
    font-size: 0.68rem;
    color: var(--stage-muted);
  }

  /* Outputs. */
  .vid {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 640 / 540;
    padding: 0;
    border: 0;
    border-radius: 8px;
    overflow: hidden;
    background: var(--stage);
    cursor: pointer;
  }

  .vid :global(video) {
    display: block;
  }

  .pp {
    position: absolute;
    right: 7px;
    bottom: 7px;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    font-size: 0.66rem;
    color: #fff;
    background: rgb(13 15 19 / 66%);
    opacity: 0.85;
  }

  .chunk {
    width: 100%;
    height: 22px;
  }

  .chunk rect {
    fill: var(--rule);
    transition: fill 0.12s linear;
  }

  .chunk rect.lit {
    fill: var(--mover);
  }

  /* The loop back from the outputs to the inputs. */
  .loop {
    grid-row: 2;
    height: 26px;
    margin-top: 12px;
    border-bottom: 2px dashed color-mix(in srgb, var(--mover) 55%, transparent);
  }

  .loop.a {
    grid-column: 1;
    position: relative;
    margin-left: 50%;
    border-left: 2px dashed color-mix(in srgb, var(--mover) 55%, transparent);
    border-bottom-left-radius: 14px;
  }

  .loop.a::before {
    content: '';
    position: absolute;
    left: -7px;
    top: -9px;
    border: 6px solid transparent;
    border-bottom: 8px solid color-mix(in srgb, var(--mover) 75%, transparent);
    border-top: 0;
  }

  .loop.b {
    grid-column: 2 / 5;
  }

  .loop.c {
    grid-column: 5;
    margin-right: 50%;
    border-right: 2px dashed color-mix(in srgb, var(--mover) 55%, transparent);
    border-bottom-right-radius: 14px;
  }

  .loop-t {
    grid-row: 3;
    grid-column: 1 / -1;
    justify-self: center;
    max-width: 44em;
    margin: 10px 0 0;
    font-size: 0.86rem;
    line-height: 1.45;
    text-align: center;
    color: var(--ink-2);
  }

  .ic {
    color: var(--mover);
    font-weight: 700;
  }

  .wam .caption {
    margin-top: 18px;
  }

  @media (max-width: 999px) {
    .wam-grid {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
    }

    .col {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
    }

    .col-h {
      grid-column: 1 / -1;
    }

    .col.in {
      grid-template-areas: 'h h' 'instr cams' 'state cams';
      grid-template-rows: auto auto 1fr;
    }

    .col.in .col-h {
      grid-area: h;
    }

    .instr {
      grid-area: instr;
    }

    .camsn {
      grid-area: cams;
    }

    .state {
      grid-area: state;
    }

    .col.model {
      grid-template-columns: minmax(0, 1fr);
    }

    .col.model .brain {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 30px minmax(0, 1fr);
      align-items: stretch;
    }

    .col.model .inner {
      height: auto;
      align-items: center;
    }

    .col.model .inner i {
      width: calc(100% - 8px);
      height: 2px;
      margin: 0 8px 0 0;
      background: repeating-linear-gradient(90deg, var(--mover-2) 0 6px, transparent 6px 11px);
      background-size: 22px 100%;
    }

    .col.model .inner i::after {
      bottom: auto;
      left: auto;
      right: -9px;
      top: -5px;
      border: 6px solid transparent;
      border-left: 8px solid var(--mover-2);
      border-right: 0;
    }

    .wam.shown .col.model .inner i {
      animation-name: flow;
    }

    .who {
      grid-column: 1 / -1;
      margin-top: 14px;
    }

    .flow {
      height: 46px;
      padding: 0;
    }

    .flow i {
      width: 2px;
      height: calc(100% - 14px);
      margin: 0 0 6px;
      background: repeating-linear-gradient(180deg, var(--mover) 0 6px, transparent 6px 11px);
      background-size: 100% 22px;
    }

    .flow i::after {
      right: auto;
      top: auto;
      bottom: -12px;
      left: -5px;
      border: 6px solid transparent;
      border-top: 8px solid var(--mover);
      border-bottom: 0;
    }

    .wam.shown .flow i {
      animation-name: flow-v;
    }

    .loop {
      display: none;
    }

    .loop-t {
      grid-row: auto;
      margin-top: 18px;
      padding-top: 14px;
      border-top: 2px dashed color-mix(in srgb, var(--mover) 45%, transparent);
      justify-self: stretch;
      max-width: none;
    }
  }

  @media (max-width: 600px) {
    .col,
    .col.in {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: none;
      grid-template-rows: none;
    }

    .col.in > *,
    .col.in .col-h {
      grid-area: auto;
    }

    .col.model .brain {
      grid-template-columns: minmax(0, 1fr);
    }

    .col.model .inner {
      height: 26px;
      justify-content: center;
    }

    .col.model .inner i {
      width: 2px;
      height: calc(100% - 6px);
      margin: 0 0 6px;
      background: repeating-linear-gradient(180deg, var(--mover-2) 0 6px, transparent 6px 11px);
      background-size: 100% 22px;
    }

    .col.model .inner i::after {
      right: auto;
      top: auto;
      bottom: -12px;
      left: -5px;
      border: 6px solid transparent;
      border-top: 8px solid var(--mover-2);
      border-bottom: 0;
    }

    .wam.shown .col.model .inner i {
      animation-name: flow-v;
    }
  }

  /* ── Figure 2 ──────────────────────────────────────────────────────────── */
  .roles {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: clamp(20px, 3vw, 40px);
    align-items: start;
  }

  .roles .caption {
    grid-column: 1 / -1;
    margin: 0;
  }

  .shot {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: var(--stage);
  }

  .ov {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .ring {
    fill: none;
    stroke-width: 2.2;
    transition:
      stroke-width 0.35s var(--ease),
      filter 0.35s var(--ease);
  }

  .ring.mover {
    stroke: var(--mover-2);
  }

  .ring.ref {
    stroke: var(--ref-2);
  }

  .ring.subj {
    stroke-width: 3.6;
  }

  .ring.mover.subj {
    filter: drop-shadow(0 0 4px rgb(63 182 204 / 85%));
  }

  .ring.ref.subj {
    filter: drop-shadow(0 0 4px rgb(239 154 98 / 85%));
  }

  .ghost {
    fill: rgb(63 182 204 / 22%);
    stroke: var(--mover-2);
    stroke-width: 1.8;
    stroke-dasharray: 4 3;
  }

  .halo,
  .move {
    fill: none;
    stroke-linecap: round;
  }

  .halo {
    stroke: rgb(255 255 255 / 70%);
    stroke-width: 4.6;
  }

  .move {
    stroke: var(--mover);
    stroke-width: 2.2;
    stroke-dasharray: 5 4;
  }

  .axis {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .legend {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
    font-size: 0.84rem;
    line-height: 1.4;
    color: var(--ink-2);
  }

  .legend li {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .legend b {
    font-weight: 500;
    margin-right: 4px;
  }

  .sw {
    flex: none;
    width: 14px;
    height: 10px;
    border-radius: 3px;
    border: 2px solid;
    transform: translateY(1px);
  }

  .sw.mover {
    border-color: var(--mover-2);
  }

  .sw.ref {
    border-color: var(--ref-2);
  }

  .sw.ghost {
    border: 2px dashed var(--mover-2);
    background: rgb(63 182 204 / 22%);
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .wh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 28px;
  }

  .lbl {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .stopper {
    border: 1px solid var(--rule-2);
    background: var(--card);
    border-radius: 999px;
    padding: 3px 11px;
    font-size: 0.76rem;
    color: var(--ink-2);
    cursor: pointer;
  }

  .stopper:hover {
    border-color: var(--ink-2);
  }

  .opts {
    display: grid;
    gap: 10px;
  }

  .opt {
    display: flex;
    flex-direction: column;
    gap: 7px;
    width: 100%;
    text-align: left;
    padding: 12px 14px 13px 16px;
    border: 1px solid var(--rule);
    border-left: 4px solid var(--rule-2);
    border-radius: 10px;
    background: var(--paper);
    cursor: pointer;
    transition:
      border-color 0.3s var(--ease),
      background 0.3s var(--ease),
      box-shadow 0.3s var(--ease);
  }

  .opt:hover {
    border-color: var(--rule-2);
  }

  .opt[aria-pressed='true'] {
    background: var(--card);
    box-shadow: var(--shadow);
  }

  .opt.D[aria-pressed='true'] {
    border-color: color-mix(in srgb, var(--dir) 45%, var(--rule));
    border-left-color: var(--dir);
  }

  .opt.S[aria-pressed='true'] {
    border-color: color-mix(in srgb, var(--tf) 45%, var(--rule));
    border-left-color: var(--tf);
  }

  .opt.I[aria-pressed='true'] {
    border-color: color-mix(in srgb, var(--rf) 45%, var(--rule));
    border-left-color: var(--rf);
  }

  .oh {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .fname {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink-2);
  }

  .ot {
    font-family: var(--serif);
    font-size: 1.04rem;
    line-height: 1.45;
    color: var(--ink-2);
  }

  .opt[aria-pressed='false'] .ot {
    color: var(--muted);
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin: 2px 0 0;
    padding: 11px 14px;
    border-radius: 10px;
    background: var(--paper-2);
    font-size: 0.92rem;
    line-height: 1.5;
  }

  .rl {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .rs b {
    font-weight: 600;
  }

  .same {
    display: flex;
    gap: 9px;
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.45;
    color: var(--ink-2);
  }

  .ok {
    flex: none;
    color: var(--kept);
    font-weight: 700;
  }

  @media (max-width: 859px) {
    .roles {
      grid-template-columns: minmax(0, 1fr);
    }

    /* The close view is a 260 px crop; cap its upscaling on tablets. */
    .scene {
      width: 100%;
      max-width: 34rem;
      justify-self: center;
    }
  }

  /* ── The question and related work ─────────────────────────────────────── */
  .ask {
    position: relative;
    margin: clamp(22px, 3vw, 34px) 0 0;
    padding: 4px 0 4px clamp(20px, 3vw, 34px);
    max-width: 920px;
  }

  .ask::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 4px;
    background: linear-gradient(180deg, var(--mover), var(--ref));
  }

  .ask p {
    margin: 0;
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(1.55rem, 1.1rem + 1.8vw, 2.5rem);
    line-height: 1.18;
    letter-spacing: -0.01em;
    color: var(--ink);
    text-wrap: balance;
  }

  .sub.tight-top {
    margin-top: clamp(22px, 3vw, 32px);
  }

  .prior {
    list-style: none;
    margin: clamp(22px, 3vw, 32px) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .pc {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 16px 15px;
    border: 1px solid var(--rule);
    border-radius: 12px;
    background: var(--card);
    min-width: 0;
  }

  .pc .tag {
    align-self: flex-start;
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .pc h4 {
    margin: 0;
    font-family: var(--serif);
    font-weight: 500;
    font-size: 1.14rem;
    line-height: 1.22;
  }

  .pc p {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .refs {
    list-style: none;
    margin: auto 0 0;
    padding: 4px 0 0;
    display: grid;
    gap: 8px;
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--muted);
  }

  .refs a {
    color: var(--ink-2);
  }

  .pc.ours {
    grid-column: 1 / -1;
    border-color: color-mix(in srgb, var(--mover) 40%, var(--rule));
    background: linear-gradient(100deg, var(--mover-soft), var(--card) 55%, var(--ref-soft));
  }

  .pc.ours .tag {
    color: var(--mover-ink);
    font-weight: 600;
  }

  .pc.ours h4 {
    font-size: clamp(1.2rem, 1.05rem + 0.5vw, 1.45rem);
  }

  .pc.ours p {
    max-width: var(--measure);
  }

  @media (max-width: 1000px) {
    .prior {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .prior {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ── Design and roadmap ────────────────────────────────────────────────── */
  .eq {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    margin-top: clamp(24px, 3vw, 36px);
  }

  .term {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 14px 13px;
    border: 1px solid var(--rule);
    border-radius: 12px;
    background: var(--card);
    min-width: 0;
  }

  .op {
    position: absolute;
    left: -12px;
    top: 50%;
    width: 12px;
    transform: translateY(-50%);
    text-align: center;
    font-family: var(--mono);
    font-size: 0.86rem;
    color: var(--muted);
  }

  .term.first .op {
    display: none;
  }

  .term .n {
    font-family: var(--serif);
    font-size: clamp(1.9rem, 1.4rem + 1.4vw, 2.6rem);
    line-height: 1.05;
    font-weight: 500;
    color: var(--ink);
  }

  .term .w {
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
  }

  .term .nt {
    font-size: 0.76rem;
    line-height: 1.35;
    color: var(--muted);
  }

  .term.total {
    background: var(--stage);
    border-color: var(--stage);
  }

  .term.total .n,
  .term.total .w {
    color: var(--stage-ink);
  }

  .term.total .nt {
    color: var(--stage-muted);
  }

  @media (max-width: 860px) {
    .eq {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 22px 18px;
    }

    .op {
      left: -16px;
      width: 16px;
    }

    .term:nth-child(odd) .op {
      left: 50%;
      top: -11px;
      width: auto;
      transform: translate(-50%, -50%);
    }

    .term.total {
      grid-column: 1 / -1;
    }

    .term.total .op {
      left: 50%;
      top: -11px;
      width: auto;
      transform: translate(-50%, -50%);
    }
  }

  .roadmap {
    margin-top: clamp(48px, 6vw, 80px);
  }

  .rh {
    font-size: clamp(1.3rem, 1.1rem + 0.7vw, 1.65rem);
  }

  .roadmap ol {
    list-style: none;
    margin: 18px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 28px;
    border-top: 1px solid var(--rule-2);
  }

  .roadmap li {
    border-bottom: 1px solid var(--rule-2);
  }

  .roadmap a {
    display: grid;
    grid-template-columns: 2.4em minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 12px;
    padding: 14px 6px;
    text-decoration: none;
    border-radius: 8px;
    transition: background 0.25s var(--ease);
  }

  .roadmap a:hover {
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  .rn {
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--muted);
  }

  .rb {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .rname {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .rq {
    font-family: var(--serif);
    font-size: 1.1rem;
    line-height: 1.32;
    color: var(--ink);
  }

  .ra {
    align-self: center;
    color: var(--mover);
    transition: transform 0.25s var(--ease);
  }

  .roadmap a:hover .ra {
    transform: translateX(3px);
  }

  @media (max-width: 760px) {
    .roadmap ol {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .col,
    .ring,
    .opt,
    .chunk rect {
      transition: none;
    }

    .wam.shown .flow i,
    .wam.shown .inner i {
      animation: none;
    }
  }
</style>
