<script lang="ts">
  import { SCENES, GOALS } from '../../lib/study';
  import { N, startImage, sceneObjects } from '../../lib/setup';

  let pick = $state<Record<string, number>>(Object.fromEntries(SCENES.map((s) => [s.id, 1])));
</script>

<div class="scenes">
  {#each SCENES as s (s.id)}
    {@const goals = GOALS.filter((g) => g.scene.id === s.id)}
    {@const inGoal = new Set(goals.flatMap((g) => [g.mover, g.reference]))}
    {@const c = pick[s.id]}
    <article class="scard">
      <header>
        <h4>{s.title}</h4>
        <span class="len">{s.seconds}&nbsp;s per episode</span>
      </header>
      <div class="frame">
        <img
          src={startImage(s.id, c)}
          alt="{s.title} scene, start {c}: top view at the first step, robot at the top"
          width="536"
          height="390"
          loading="lazy"
          decoding="async"
        />
        <span class="robot" data-qa-overlay>Robot</span>
        <span class="tag mono" data-qa-overlay>Start {c}</span>
      </div>
      <div class="axis" aria-hidden="true"><span>← robot’s right</span><span>robot’s left →</span></div>
      <ul class="thumbs" aria-label="{s.title}: starts">
        {#each { length: N.starts } as _, i (i)}
          <li>
            <button type="button" aria-pressed={c === i + 1} aria-label="Show start {i + 1}" onclick={() => (pick[s.id] = i + 1)}>
              <img src={startImage(s.id, i + 1)} alt="" width="536" height="390" loading="lazy" decoding="async" />
              <span class="n mono" data-qa-overlay>{i + 1}</span>
            </button>
          </li>
        {/each}
      </ul>
      <div class="row">
        <span class="lbl">Objects</span>
        <ul class="chips">
          {#each sceneObjects(s.id) as o (o.key)}
            <li class:off={!inGoal.has(o.key)}>{o.name}{#if !inGoal.has(o.key)}<span class="nogoal">, in no goal</span>{/if}</li>
          {/each}
        </ul>
      </div>
      <div class="row">
        <span class="lbl">Goals</span>
        <ul class="goals">
          {#each goals as g (g.key)}
            <li>
              <span class="badge" class:native={g.native}>{g.native ? 'RoboLab' : 'Added'}</span>
              <span>{g.label}{#if g.initiallyTrue}<span class="ok" title="Already true at the start">&nbsp;✓</span>{/if}</span>
            </li>
          {/each}
        </ul>
      </div>
    </article>
  {/each}
</div>
<p class="caption">
  Top views at the first step, rotated so that the robot sits at the top edge. The robot’s left is therefore the image’s right.
  “RoboLab” marks the benchmark’s own goals; “Added” goals reuse the same objects. ✓ marks a goal that already holds at the start.
  The logged object poses at the first step are identical for every goal, wording and model that shares a start; the rendered frames
  differ only by small rendering noise.
</p>

<style>
  .scenes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin: 22px 0 12px;
  }

  @media (max-width: 720px) {
    .scenes {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .scard {
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px 12px;
  }

  h4 {
    margin: 0;
    font-family: var(--serif);
    font-size: 1.2rem;
    font-weight: 600;
  }

  .len {
    font-size: 0.84rem;
    color: var(--muted);
  }

  .frame {
    position: relative;
    border-radius: 10px;
    overflow: hidden;
    background: var(--paper-2);
    aspect-ratio: 536 / 390;
  }

  .frame img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 100%;
  }

  .robot,
  .tag {
    position: absolute;
    top: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgb(20 22 26 / 0.72);
    color: #fff;
    font-size: 0.72rem;
    line-height: 1.5;
    white-space: nowrap;
  }

  .robot {
    left: 50%;
    transform: translateX(-50%);
  }

  .tag {
    left: 8px;
  }

  .axis {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: -4px;
    font-size: 0.74rem;
    color: var(--muted);
  }

  .thumbs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 5px;
    container-type: inline-size;
  }

  .thumbs button {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 6px;
    overflow: hidden;
    background: var(--paper-2);
    cursor: pointer;
    aspect-ratio: 536 / 390;
  }

  .thumbs button[aria-pressed='true'] {
    border-color: var(--ink);
  }

  .thumbs button:focus-visible {
    outline: 2px solid var(--tf);
    outline-offset: 2px;
  }

  .thumbs img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 100%;
  }

  .thumbs .n {
    position: absolute;
    right: 2px;
    bottom: 2px;
    min-width: 14px;
    padding: 0 3px;
    border-radius: 4px;
    background: rgb(20 22 26 / 0.72);
    color: #fff;
    font-size: 0.66rem;
    line-height: 1.35;
    text-align: center;
  }

  @media (max-width: 420px) {
    .thumbs {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .row {
    display: grid;
    gap: 4px;
  }

  .chips,
  .goals {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chips li {
    padding: 2px 10px;
    border: 1px solid var(--rule-2);
    border-radius: 8px;
    font-size: 0.84rem;
  }

  .chips li.off {
    color: var(--muted);
    border-style: dashed;
  }

  .nogoal {
    color: var(--muted);
  }

  .goals {
    flex-direction: column;
    gap: 4px;
  }

  .goals li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 0.88rem;
  }

  .badge {
    flex: none;
    width: 4.9rem;
    text-align: center;
    padding: 1px 6px;
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    border: 1px solid var(--rule-2);
    color: var(--muted);
  }

  .badge.native {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .ok {
    color: var(--kept);
    font-weight: 700;
  }
</style>
