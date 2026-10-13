<script lang="ts">
  import { sceneFps, sec, type FailuresProps } from '../lib/failures';
  import { sceneById, study } from '../lib/study';
  import CameraContext from './failures/CameraContext.svelte';
  import LossFlow from './failures/LossFlow.svelte';
  import LostRollout from './failures/LostRollout.svelte';
  import Stages from './failures/Stages.svelte';
  import WrongObject from './failures/WrongObject.svelte';

  let { pair, mustard, lost, pool, agg }: FailuresProps = $props();
  const S = study.settings.scoring;
  const snapTick = $derived(Math.round((pair.rf.tStableDone ?? 0) * sceneFps(pair.rf.s)));
  const camPairs = $derived([
    { tf: mustard.tf, rf: mustard.rf, tick: mustard.tf.n - 1, when: `End of the ${sceneById(mustard.tf.s).seconds}\u00a0s episode` },
    { tf: pair.tf, rf: pair.rf, tick: snapTick, when: `The paper’s ${sec(snapTick / sceneFps(pair.rf.s))} snapshot` },
  ]);
</script>

<section class="section dark failures" id="failures">
  <div class="wrap">
    <header class="intro">
      <div class="eyebrow">05 · Failures</div>
      <h2>When a placement fails, is lost, or is reached the wrong way</h2>
      <p class="lede">
        The scorer checks spatial outcomes only. A placement counts once the target holds the requested relation for {S.holdS}&nbsp;continuous
        second while it rests on the table, moves slower than {S.speedCmS}&nbsp;cm/s and is clear of the gripper. Neither check identifies which
        object moved.
      </p>
    </header>

    <div class="sub wide" id="failures-wrong-object">
      <h3>A placement reached by moving the wrong object</h3>
      <p>
        Both Nano instructions ask the robot to move the Rubik’s cube behind the bowl. Play them side by side and watch what the gripper holds.
      </p>
      <WrongObject tf={pair.tf} rf={pair.rf} />
      <blockquote class="interp">
        <p>
          Both Nano instructions ask the robot to move the cube behind the bowl. In the reference-first rollout, however, the robot holds the bowl
          while the cube remains on the tabletop. Moving the bowl changes the relative positions enough for the cube-behind check to pass. The
          target-first rollout does not pass that check. Thus, the reference-first score advantage in this example is not evidence of better
          instruction following: the predicate credits a relation that became true through manipulation of the wrong object.
        </p>
        <footer>Appendix D.1</footer>
      </blockquote>
      <p class="note">
        Selected from the recorded outcome differences before their videos were inspected. The example illustrates possible behaviour and is not
        used to estimate how often it happens. Labels describe recorded spatial outcomes, not complete instruction success.
      </p>
    </div>

    <div class="sub wide" id="failures-camera-context">
      <h3>Camera context</h3>
      <p>
        The close views are a fixed crop of one exterior camera. Step through both example pairs at the paper’s snapshot times, or scrub them, in
        the close view or in a second camera.
      </p>
      <CameraContext pairs={camPairs} />
    </div>

    <div class="sub wide" id="failures-any-time-vs-end">
      <h3>Placed, then lost: any time versus the end</h3>
      <p>
        The main score credits a stable placement reached at any time. A stricter check asks whether the placement conditions still hold throughout
        the final {S.holdS}&nbsp;s of the episode. Filter by model or wording to see how many placements survive to the end.
      </p>
      <LossFlow {agg} />
    </div>

    <div class="sub wide" id="failures-failure-stages">
      <h3>Where runs stop</h3>
      <p>
        Each episode is assigned the furthest stage it reached: touching the target, lifting it, meeting the goal, and holding a stable placement.
      </p>
      <Stages {agg} />
    </div>

    <div class="sub wide" id="failures-placed-then-lost">
      <h3>One placement that was lost</h3>
      <p>A single rollout that is credited at any time but fails the end check: watch where the goal stops holding.</p>
      <LostRollout ep={lost} {pool} />
    </div>
  </div>
</section>

<style>
  .interp {
    margin: clamp(24px, 3vw, 36px) 0 0;
    max-width: 880px;
    padding: 4px 0 4px 20px;
    border-left: 3px solid var(--rf-2);
  }

  .interp p {
    margin: 0;
    font-family: var(--serif);
    font-size: clamp(1.02rem, 0.95rem + 0.3vw, 1.18rem);
    line-height: 1.55;
    color: #d5d9e0;
  }

  .interp footer {
    margin-top: 8px;
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--stage-muted);
  }

  .wide > .note {
    margin-top: 18px;
  }

  .wide {
    max-width: none;
  }

  .wide > p,
  .wide > h3 {
    max-width: 880px;
  }
</style>
