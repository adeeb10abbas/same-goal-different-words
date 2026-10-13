<script lang="ts">
  import type { ModelId } from '../lib/study';
  import type { ConsoleSeed, GridCodes, PairCard, PlacementCard, VqaSel } from '../lib/vqa';
  import Arrangement from './language/Arrangement.svelte';
  import Console from './language/Console.svelte';
  import Findings from './language/Findings.svelte';
  import Scoreboard from './language/Scoreboard.svelte';

  /** 05: the backbone instruction-understanding test (paper Sec. 4 and App. F). */
  let {
    codes,
    placement,
    seed,
    placementCards,
    pairCards,
  }: {
    codes: GridCodes;
    placement: Record<ModelId, string>;
    seed: ConsoleSeed;
    placementCards: PlacementCard[];
    pairCards: PairCard[];
  } = $props();

  let con: Console | undefined = $state();
  const show = (p: VqaSel) => con?.show(p);
  const tour = (i: number) => con?.playTour(i);
</script>

<section class="section alt language" id="language">
  <div class="wrap">
    <header class="intro">
      <div class="eyebrow">05 · Interpreting the goal</div>
      <h2>Some backbones misread the goal before the robot moves</h2>
      <p class="lede">
        To separate understanding from manipulation, we gave each policy's vision-language backbone the same 30 instructions and asked it to
        name the object to move, the reference and the requested relation. FLUX's text encoder reverses reference-first relations, Edge's
        reasoner errs even on direct commands, and Nano reads every sentence correctly from text, until camera images are added.
      </p>
    </header>

    <ol class="how">
      <li>
        <b>Same 30 instructions</b>
        <span>The ten cube, butter and mustard goals, each in direct, target-first and reference-first wording. Bowl stacking is excluded.</span>
      </li>
      <li>
        <b>Four prompt conditions</b>
        <span>Text alone, text with camera descriptions, text with the three camera images of each of eight starts, and both.</span>
      </li>
      <li>
        <b>One answer, all three parts</b>
        <span>Greedy decoding into a fixed JSON vocabulary. Object to move, reference and relation must all be right.</span>
      </li>
    </ol>

    <div class="console-wrap">
      <Console bind:this={con} {codes} {seed} />
    </div>

    <Findings {codes} {placement} {placementCards} onshow={show} ontour={tour} />

    <div class="sub">
      <h3>Every condition, every model</h3>
      <p>
        Accuracy for each backbone, wording and prompt condition. Select a cell to replay its first wrong answer in the console; perfect cells
        replay a correct one.
      </p>
    </div>
    <Scoreboard {codes} onshow={show} />

    <div class="sub">
      <h3>Judging the visible arrangement was inconclusive</h3>
      <p>
        We also asked whether the current camera views already show the requested relation, allowing an insufficient-evidence answer. Labels
        come from saved simulator geometry and contact, and each item is asked under both assignments of the yes and no answer codes.
      </p>
    </div>
    <Arrangement {pairCards} />

    <aside class="limits" aria-labelledby="language-limits">
      <h4 id="language-limits">What these tests can and cannot show</h4>
      <ul>
        <li>
          <b>Exploratory.</b> A preliminary prespecified test, which asked whether an image matched the instruction, was inconclusive. This
          protocol was fixed after seeing it, so it is not an independent confirmatory test.
        </li>
        <li>
          <b>Matched components.</b> Nano's language component has the same weights as Qwen3-VL-8B-Instruct and Edge's matches the released
          Cosmos3-Edge reasoner. FLUX's frozen encoder matches Qwen3-VL-4B-Instruct, which its policy uses only for text, so its image results
          (†) are auxiliary. These comparisons do not show degradation of component weights during robot adaptation.
        </li>
        <li>
          <b>Scoring.</b> Constrained decoding fixes the JSON format and vocabulary but allows wrong choices, and all three fields must be right.
          Scores are not comparable to the preliminary unrestricted answers.
        </li>
        <li>
          <b>Uncertainty.</b> Image accuracy averages starts within goals, goals within scenes and the three scenes equally. Intervals come from
          10,000 bootstrap resamples of starts within scenes, conditional on the text answers, scenes and wording templates, not on new
          instructions.
        </li>
        <li>
          <b>Scope.</b> Bowl stacking is excluded. The images are 24 initial and 48 saved-rollout sets of three views from 24 physical starts,
          using existing checkpoints and no new rollouts.
        </li>
        <li>
          <b>Not a cause.</b> These question-answering tests do not reveal the policy's internal goal representation or establish that a wrong
          answer causes a rollout failure.
        </li>
      </ul>
    </aside>
  </div>
</section>

<style>
  .how {
    list-style: none;
    margin: clamp(28px, 3.4vw, 44px) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    counter-reset: how;
  }

  .how li {
    counter-increment: how;
    display: grid;
    gap: 4px;
    align-content: start;
    padding: 14px 16px 15px;
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    background: var(--card);
  }

  .how li::before {
    content: counter(how, decimal-leading-zero);
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--faint);
  }

  .how b {
    font-size: 0.98rem;
  }

  .how span {
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--muted);
  }

  .console-wrap {
    margin-top: clamp(20px, 2.6vw, 32px);
  }

  .limits {
    margin-top: clamp(36px, 4.4vw, 56px);
    padding: clamp(18px, 2.2vw, 26px) clamp(18px, 2.4vw, 30px);
    border: 1px solid var(--rule);
    border-radius: calc(var(--radius) + 2px);
    background: color-mix(in srgb, var(--card) 60%, transparent);
  }

  .limits h4 {
    margin: 0 0 12px;
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .limits ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 32px;
  }

  .limits li {
    font-size: 0.84rem;
    line-height: 1.55;
    color: var(--ink-2);
  }

  .limits b {
    color: var(--ink);
  }

  @media (max-width: 759px) {
    .how,
    .limits ul {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
  }
</style>
