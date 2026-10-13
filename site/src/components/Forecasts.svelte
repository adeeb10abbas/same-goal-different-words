<script lang="ts">
  import { onVisible, reducedMotion } from '../lib/sync';
  import { FC, N_ALL, decodeForecasts, share, sgn } from '../lib/forecasts';
  import CountUp from './CountUp.svelte';
  import ForecastViewer from './forecasts/ForecastViewer.svelte';
  import DreamReel from './forecasts/DreamReel.svelte';
  import Pipeline from './forecasts/Pipeline.svelte';
  import Agreement from './forecasts/Agreement.svelte';
  import LabelDist from './forecasts/LabelDist.svelte';
  import ErrorMap from './forecasts/ErrorMap.svelte';
  import Utility from './forecasts/Utility.svelte';
  import RoleWaffle from './forecasts/RoleWaffle.svelte';

  let { codes }: { codes: string } = $props();
  const recs = $derived(decodeForecasts(codes));

  const R = FC.reported;
  const pooled = FC.utility.rows.find((r) => r.model === 'All')!;
  const ci = FC.utility.ci;
  const wrong = FC.events.reduce((a, e) => a + e.wrong_object, 0);
  const release = FC.events.reduce((a, e) => a + e.contradictory_release, 0);
  const agree = (name: string) => {
    const row = FC.agreement.find((r) => r[0] === name);
    if (!row) throw new Error(`Forecasts: no agreement row "${name}"`);
    return row[1];
  };
  const L = FC.labels;
  const upOnly = L.fc_direction.up_only;
  const requested = L.fc_visible_final_relation.goal;
  const [refK, refN] = FC.roleEvents.reference;
  const [movK, movN] = FC.roleEvents.mover;
  if (wrong + release !== pooled.events || pooled.n !== N_ALL) throw new Error('Forecasts: event totals disagree');
  if (!(ci[0] < 0 && ci[1] > 0)) throw new Error('Forecasts: the pooled interval no longer includes zero; revise the text');

  let shown = $state(true);
  function reveal(node: HTMLElement) {
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
      0.3,
    );
  }
</script>

<section class="section dark forecasts" id="forecasts">
  <div class="wrap">
    <header class="intro">
      <div class="eyebrow">06 · Forecasts</div>
      <h2>Do the models’ imagined futures warn of their mistakes?</h2>
      <p class="lede">
        World-action models generate robot actions together with predictions of future observations, so each of the three models here also
        shows what it expects to happen next. Whether those generated videos flag an impending error was the study’s original question. With
        vision–language models standing in for human annotators, the answer is null.
      </p>
    </header>

    <div class="sub">
      <h3>The original question</h3>
      <p>
        Before wording became the focus, this was the study’s primary question: does a policy’s generated video help identify an impending
        manipulation error, such as handling the wrong object or releasing the target into a relation it was not asked for, beyond what is
        already apparent from the current scene and proposed actions?
      </p>
      <p>
        The behavioural results arrived first and made wording the paper’s focus. At that point the planned human video annotations were
        replaced with two vision–language models, before their answers were inspected. The analysis found no measurable benefit from their
        labels, but the labels are too unreliable to say whether the information is in the videos themselves.
      </p>

      <div class="cards" class:shown {@attach reveal}>
        <article class="card">
          <div class="big"><CountUp value={pooled.events} /><span class="of">of {pooled.n} chunks</span></div>
          <p class="what">
            contained a detected error in the actions that accompanied the selected forecast: {wrong} wrong-object and {release} contradictory
            release.
          </p>
          <p class="fine">Detected from simulator state; not all visually verified.</p>
        </article>
        <article class="card">
          <div class="big"><CountUp value={pooled.delta} decimals={5} sign delay={120} /></div>
          <p class="what">
            change in held-out Brier error when the video labels join a classifier of those errors. Negative means they made it slightly worse.
          </p>
          <p class="fine">95% interval <span class="nw">[{sgn(ci[0])}, {sgn(ci[1])}]</span> includes zero.</p>
        </article>
        <article class="card">
          <div class="big"><CountUp value={R.allFieldsAgree} decimals={1} delay={240} /><span class="unit">%</span></div>
          <p class="what">
            of forecasts on which the two annotators agreed on every field. On the final spatial relation alone they agreed in
            {agree('Final spatial relation').toFixed(1)}%.
          </p>
          <p class="fine">Agreement, not accuracy: neither annotator was checked against people.</p>
        </article>
      </div>
    </div>

    <div class="sub wide">
      <h3>See what the model imagined</h3>
      <p>
        Each time a model is queried it returns a chunk of actions together with a short generated video of the future it predicts. Pick any of
        the {N_ALL} episodes to see the forecast this analysis selected, beside what the cameras then recorded. Wipe and Overlay put the two on
        top of each other.
      </p>
      <ForecastViewer {recs} />
    </div>

    <div class="sub wide">
      <h3>Whole-episode forecasts</h3>
      <p>
        For a few episodes the whole sequence of predictions was rendered. Each new request restarts the imagined future from the current
        scene, so the generated side jumps every time the model replans.
      </p>
      <DreamReel {recs} />
    </div>

    <div class="sub">
      <h3>How forecasts were labelled</h3>
      <p>
        One forecast per episode was chosen by a rule fixed without viewing any forecast or outcome. Two vision–language models then labelled
        it without seeing the instruction, the model or what actually happened.
      </p>
      <Pipeline {recs} />
    </div>

    <div class="sub">
      <h3>Agreement, not accuracy</h3>
      <p>
        With no human labels there is no ground truth to score against, only whether the two annotators agree. They agreed on the moving
        object in {agree('Moving object').toFixed(1)}% of forecasts, on the final relation in only {agree('Final spatial relation').toFixed(1)}%,
        and on every field at once in {R.allFieldsAgree.toFixed(1)}%.
      </p>
      <Agreement />
    </div>

    <div class="sub">
      <h3>What the forecasts show</h3>
      <p>
        After disagreements were resolved, the labels were classified against each episode’s request: only {share(requested, N_ALL)}% were
        credited with the requested relation. Separately, {share(upOnly, N_ALL)}% indicated upward-only motion.
      </p>
      <LabelDist />
    </div>

    <div class="sub">
      <h3>Can forecasts predict errors?</h3>
      <p>
        The test asks whether the labels add anything to what the scene and the proposed actions already reveal. For each selected forecast,
        the scorer checked the chunk of actions that accompanied it for two kinds of error.
      </p>
      <ErrorMap {recs} />
      <p class="lead2">
        Two classifiers then predicted which chunks contained an error, one with the information available at the moment of the request and
        one with the forecast’s labels added.
      </p>
      <Utility />
    </div>

    <div class="sub">
      <h3>One exploratory pattern</h3>
      <p>
        One comparison, made after seeing the results, did show a difference: detected errors were more common when the labels named the
        reference object as moving ({refK} of {refN}, {share(refK, refN)}%) than when they named the requested object ({movK} of {movN},
        {share(movK, movN)}%).
      </p>
      <RoleWaffle {recs} />
    </div>

    <div class="sub">
      <h3>Caveats</h3>
      <ul class="caveats">
        <li>
          <b>The labels are unvalidated.</b> Neither annotation set has been checked against human judgments; the agreement figures describe
          agreement, not accuracy.
        </li>
        <li>
          <b>Vision–language models, not people.</b> They replaced the planned human annotation. Disagreements were resolved by Qwen, which had
          also supplied one of the two original answers, so that step is not independent validation.
        </li>
        <li>
          <b>A null result.</b> The analysis cannot distinguish an uninformative short forecast from a failure to extract useful information
          from it. Human validation of object identity, motion, spatial relations and detected errors is needed before attributing it to the
          generated videos.
        </li>
        <li>
          <b>Imperfect inputs.</b> Two inspected examples showed overlapping object numbers and direction arrows, occasional object-name
          confusions and image stretching in the common layout, and the numbered scene image could precede the forecast by several actions.
          Those two predictions matched their actions and camera, but the check was not extended to every forecast, and it was not established
          that generated motion follows the rollout’s timing.
        </li>
        <li>
          <b>Privileged information.</b> Event detection and the classifier use simulator state, so this is not a deployable failure detector,
          and the detected events have not all been visually verified.
        </li>
        <li>
          <b>Independent of the main results.</b> The behavioural findings elsewhere on this page do not depend on these video annotations.
        </li>
      </ul>
    </div>
  </div>
</section>

<style>
  .forecasts {
    --wrong: #ff6b6b;
    --release: #b99dff;
  }

  .wide {
    max-width: none;
  }

  .wide > p,
  .wide > h3 {
    max-width: 880px;
  }

  .lead2 {
    margin-top: 34px !important;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: clamp(28px, 3.6vw, 44px);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 20px 16px;
    border-radius: var(--radius);
    background: var(--stage-2);
    border: 1px solid var(--stage-rule);
    transition:
      opacity 0.6s var(--ease),
      transform 0.6s var(--ease);
  }

  .cards:not(.shown) .card {
    opacity: 0;
    transform: translateY(12px);
  }

  .card:nth-child(2) {
    transition-delay: 0.08s;
  }

  .card:nth-child(3) {
    transition-delay: 0.16s;
  }

  .big {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    font-family: var(--serif);
    font-size: clamp(2.1rem, 1.7rem + 1.2vw, 2.8rem);
    line-height: 1;
    letter-spacing: -0.02em;
    color: #fff;
  }

  .big .of,
  .big .unit {
    font-family: var(--sans);
    font-size: 0.95rem;
    letter-spacing: 0;
    color: var(--stage-muted);
  }

  .big .unit {
    margin-left: -6px;
    font-family: var(--serif);
    font-size: 0.7em;
    color: #fff;
  }

  .what {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: #c9ced6;
  }

  .fine {
    margin: 0;
    margin-top: auto;
    font-size: 0.76rem;
    color: var(--stage-muted);
  }

  .caveats {
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 28px;
  }

  .caveats li {
    padding: 2px 0 2px 14px;
    border-left: 2px solid var(--stage-rule);
    font-size: 0.88rem;
    line-height: 1.55;
    color: #c9ced6;
  }

  .caveats b {
    display: block;
    margin-bottom: 2px;
    font-weight: 600;
    color: #fff;
  }

  @media (max-width: 820px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 700px) {
    .caveats {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      transition: none;
    }
  }
</style>
