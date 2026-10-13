<script lang="ts">
  import type { Episode } from '../lib/media';
  import { MODELS, SCENES, GOALS, study } from '../lib/study';
  import { N, TOTAL, NATIVE_GOALS, word, Word, int } from '../lib/setup';
  import PairedDesign from './setup/PairedDesign.svelte';
  import Scenes from './setup/Scenes.svelte';
  import Instructions from './setup/Instructions.svelte';
  import Models from './setup/Models.svelte';
  import ScorerPlay from './setup/ScorerPlay.svelte';
  import ScorerReal from './setup/ScorerReal.svelte';
  import AnyTimeEnd from './setup/AnyTimeEnd.svelte';
  import StatsDemo from './setup/StatsDemo.svelte';

  let { codes, rollout, examples }: { codes: string; rollout: Episode; examples: Episode[] } = $props();

  const sc = study.settings.scoring;
  const added = GOALS.length - NATIVE_GOALS.length;
</script>

<section class="section alt setup" id="setup">
  <div class="wrap">
    <header class="intro">
      <div class="eyebrow">03 · Setup</div>
      <h2>Same start, same goal, same model. Only the words change.</h2>
      <p class="lede">
        Each model attempts each goal from the same recorded starts, once per wording. The robot and objects are reset before every
        instruction and the random seed is fixed, so the {word(N.forms)} wordings begin from the same saved simulator state. Every placement
        rate on this site comes from these {int(TOTAL)} paired episodes.
      </p>
    </header>

    <PairedDesign {codes} example={rollout} />

    <div class="sub full" id="setup-scenes">
      <h3>{Word(N.scenes)} scenes, {word(N.starts)} starts each</h3>
      <p>
        The scenes come from RoboLab, a simulation benchmark for generalist manipulation policies. {Word(NATIVE_GOALS.length)} goals are RoboLab’s own;
        {word(added)} more reuse the same objects. Each start is a small change in the object poses that a scripted controller can
        solve. Every goal, wording and model in a scene shares the same {word(N.starts)} starts. A scene with two bins had no qualifying
        start and was dropped before any outcomes were collected.
      </p>
      <Scenes />
    </div>

    <div class="sub full" id="setup-instructions">
      <h3>All {N.goals * N.forms} instructions</h3>
      <p>
        The direct command (DIR) keeps RoboLab’s original wording where it exists, spelling included. Target-first (TF) and
        reference-first (RF) start the same way and ask the robot to move the same object. After “so that”, TF describes the target
        relative to the reference. RF describes the reference relative to the target, with the relation inverted.
      </p>
      <Instructions />
    </div>

    <div class="sub full" id="setup-models">
      <h3>{Word(N.models)} models, one protocol</h3>
      <p>
        We evaluate the DROID versions of {MODELS.map((m) => m.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}. Each model keeps
        its released implementation and image preprocessing. The cameras, the action rate and the seed are the same for all
        {word(N.models)}.
      </p>
      <Models />
    </div>

    <div class="sub full" id="setup-scorer">
      <h3>What counts as a placement</h3>
      <p>
        A scorer checks the requested arrangement from the simulator’s object poses and contacts. A <b>stable placement</b> needs the
        relation, support, a target released from the gripper, and a speed below {sc.speedCmS}&nbsp;cm/s, all held for
        {sc.holdS === 1 ? 'one' : sc.holdS} continuous second{sc.holdS === 1 ? '' : 's'}. Directions use the robot’s frame. Try it:
      </p>
      <ScorerPlay />
      <ScorerReal ep={rollout} />
    </div>

    <div class="sub full" id="setup-outcomes">
      <h3>Any time, or at the end</h3>
      <AnyTimeEnd {codes} {examples} />
    </div>

    <div class="sub full" id="setup-stats">
      <h3>How the wordings are compared</h3>
      <StatsDemo {codes} />
    </div>

    <p class="note end">
      The scorer reads simulator state after each run; the policies never see it. Its two outcomes describe placements, not complete
      instruction following: neither identifies which object moved. Across all {SCENES.length} scenes the set-up is identical for the
      {word(N.forms)} wordings, so the differences in the next sections come from the words.
    </p>
  </div>
</section>

<style>
  .setup :global(.sub.full) {
    max-width: none;
  }

  .note.end {
    margin-top: clamp(48px, 6vw, 80px);
  }
</style>
