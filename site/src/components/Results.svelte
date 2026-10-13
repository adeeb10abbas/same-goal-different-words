<script lang="ts">
  import ContrastExplorer from './results/ContrastExplorer.svelte';
  import GoalBoard from './results/GoalBoard.svelte';
  import Cancellation from './results/Cancellation.svelte';
  import RateSlopes from './results/RateSlopes.svelte';
  import Robustness from './results/Robustness.svelte';
  import CountTables from './results/CountTables.svelte';
  import { study, MODELS, SCENES, GOALS, FORM_ORDER } from '../lib/study';
  import { num, signed, spell, STARTS, type Bits } from '../lib/results';

  let { bits, countsOpen = false }: { bits: Bits; countsOpen?: boolean } = $props();

  const C = study.contrasts;
  const head = C.TF_RF.anytime.All;
  const starts = head.starts as { scene: string; d: number }[];
  const up = starts.filter((s) => s.d > 0).length;
  const down = starts.filter((s) => s.d < 0).length;
  const tie = starts.length - up - down;

  const goalOf = (key: string) => GOALS.find((g) => g.key === key)!;
  const rel = [...study.relation].sort((a, b) => a.est - b.est);
  const lo = rel[0];
  const hi = rel[rel.length - 1];
  const negatives = rel.filter((r) => r.est < 0);
  // A scene whose goals pull in opposite directions yet sum to zero.
  const cancelScene = SCENES.find((sc) => {
    const ests = study.relation.filter((r) => r.key.startsWith(`${sc.id}-`)).map((r) => r.est);
    return ests.some((v) => v > 0) && ests.some((v) => v < 0) && Math.abs(ests.reduce((t, v) => t + v, 0)) < 1e-9;
  });
  const cancelNeg = cancelScene ? negatives.find((r) => r.key.startsWith(`${cancelScene.id}-`)) : undefined;

  // RF is the lowest wording for every model under both outcomes, with or without goals already true at reset.
  const rfAlwaysLowest = (['byModelForm', 'byModelFormExcl'] as const).every((k) =>
    (['anytime', 'end'] as const).every((o) =>
      MODELS.every((m) => FORM_ORDER.every((f) => f === 'I' || study.rates[k][m.id].I[o] < study.rates[k][m.id][f][o])),
    ),
  );
  const noBowls = C.TF_RF.anytimeNoBowls.est;
  const dirRf = C.DIR_RF.anytime.All.est;
</script>

<section class="section results" id="results">
  <div class="wrap">
    <header class="intro">
      <div class="eyebrow">04 · Results</div>
      <h2>Where the gap holds, and where it flips</h2>
      <p class="lede">
        The <b class="num">{num(head.est)}-point</b> target-first advantage is an average. Each of the {starts.length} physical starts gives its own
        paired difference: <b class="num">{up}</b> favour TF, <b class="num">{down}</b> favour RF and <b class="num">{tie}</b> tie. By goal the effect
        ranges from <b class="num">{signed(lo.est)}</b> to <b class="num">{signed(hi.est)}</b> points{#if negatives.length === 1}, reverses for one
          goal{/if}{#if cancelScene}, and cancels out completely in the {cancelScene.short.toLowerCase()} scene{/if}. This section shows every
        number behind the headline, including the appendix tables.
      </p>
    </header>

    <div class="sub wide" id="results-starts">
      <h3>Same start, same model: every paired difference</h3>
      <p>
        Each dot is one physical start: the difference in placement rate between two wordings from that start, averaged over its goals (and, in
        the top row, over the {spell(MODELS.length)} models). Pairing this way cancels out how hard a start is. Switch the contrast to bring in the direct
        instruction, or the outcome to require the placement at episode end.
      </p>
      <ContrastExplorer {bits} />
    </div>

    <div class="sub wide" id="results-goals">
      <h3>The average hides a reversal</h3>
      <p>
        Pooled over models, the TF − RF gap ranges from <b class="num">{signed(lo.est)}&nbsp;points</b> for {goalOf(lo.key).short} to
        <b class="num">{signed(hi.est)}</b> for {goalOf(hi.key).short}. The heatmap gives each model’s placements out of {spell(STARTS)} for every goal and
        wording; the forest gives the pooled difference with its interval. Each goal rests on {spell(STARTS)} physical starts, so these per-goal estimates are
        descriptive: they show where the effect is, not a rule for every task.
      </p>
      <GoalBoard />
    </div>

    {#if cancelScene && cancelNeg}
      <div class="sub" id="results-cancel">
        <h3>Opposite effects can cancel</h3>
        <p>
          In the {cancelScene.short.toLowerCase()} scene, effects in opposite directions cancel: RF does better for {goalOf(cancelNeg.key).short}
          even though the scene’s average gap is zero. An aggregate score can therefore hide sensitivity to individual relations.
        </p>
        <Cancellation />
      </div>
    {/if}

    <div class="sub wide" id="results-rates">
      <h3>Placement rates by model and wording</h3>
      <p>
        The rates behind the paired differences, balanced across scenes as in the paper.
        {#if rfAlwaysLowest}RF is the lowest of the {spell(FORM_ORDER.length)} wordings for every model, under both outcomes and with or without the
          goals already true at reset.{/if}
        {#if 2 * study.flow.end < study.flow.anytime}Fewer than half of the any-time placements also pass the episode-end check.{/if}
      </p>
      <RateSlopes />
    </div>

    <div class="sub wide" id="results-robust">
      <h3>Checks on the headline</h3>
      <p>
        The bowl scene needs separate reading: its RF prompt describes the lower bowl as underneath and supporting the target, which does not
        explicitly require the nesting the benchmark checks. Without that scene the estimate is <b class="num">{num(noBowls, 2)}&nbsp;points</b>, so
        the direction does not depend on the bowl-language ambiguity; that check is descriptive and does not establish that the bowl prompts are
        equivalent. In an exploratory comparison, the short direct instruction also outperforms reference-first wording on average, by
        <b class="num">{num(dirRf)}&nbsp;points</b>. That comparison was added after the original analyses, and because the forms also differ in
        length and sentence construction it cannot isolate the effect of changing spatial perspective.
      </p>
      <Robustness />
    </div>

    <div class="sub wide" id="results-counts">
      <h3>Every count</h3>
      <p>
        The appendix count tables in one place, with totals. Every rate and difference in this section can be rebuilt from them, and they download
        as CSV.
      </p>
      <CountTables open={countsOpen} />
    </div>
  </div>
</section>

<style>
  .sub.wide {
    max-width: none;
  }

  .lede b,
  .sub > p b {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 0.94em;
  }
</style>
