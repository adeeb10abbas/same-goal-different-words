<script lang="ts">
  import { MODELS, SCENES, study } from '../../lib/study';

  const st = study.settings;
  // Paper, Sec. 3: "Nano and FLUX were selected for strong RoboLab performance, with Edge providing a smaller Cosmos comparison."
  const ROLE: Record<string, string> = {
    N3: 'Selected for strong RoboLab performance.',
    E3: 'Provides a smaller Cosmos comparison.',
    F3: 'Selected for strong RoboLab performance.',
  };
  for (const m of MODELS) if (!ROLE[m.id]) throw new Error(`Models: no role line for ${m.id}`);
  for (const r of st.rows) if (r.length !== MODELS.length + 1) throw new Error(`Models: settings row "${r[0]}" has ${r.length} cells`);

  const secs = SCENES.map((s) => s.seconds);
  const lo = Math.min(...secs);
  const hi = Math.max(...secs);
  const perRequest = (st.actionsPerRequest / st.hz).toFixed(1);
</script>

<div class="models">
  {#each MODELS as m (m.id)}
    <article class="mcard">
      <span class="mono short">{m.short}</span>
      <h4>{m.name}</h4>
      <p class="role">{ROLE[m.id]}</p>
      <p class="lm"><span class="lbl">Language backbone</span> <span class="mono">{m.lm}</span></p>
    </article>
  {/each}
</div>

<dl class="proto">
  <div>
    <dt>Inputs</dt>
    <dd>The wrist camera and two exterior cameras, plus the robot’s proprioceptive state. The scorer’s output is never an input.</dd>
  </div>
  <div>
    <dt>Actions</dt>
    <dd>
      {st.actionsPerRequest} actions per request at {st.hz}&nbsp;Hz, so each request covers about {perRequest}&nbsp;s of motion.
    </dd>
  </div>
  <div>
    <dt>Seed</dt>
    <dd><span class="num">{st.seed}</span> for every episode.</dd>
  </div>
  <div>
    <dt>Length</dt>
    <dd>{lo}–{hi}&nbsp;s by scene. Control continues after a placement until the time runs out.</dd>
  </div>
  <div>
    <dt>Reset</dt>
    <dd>Robot and objects return to the saved start before every instruction.</dd>
  </div>
</dl>

<div class="tscroll" data-qa-scroll tabindex="0" role="region" aria-label="Inference settings, scrollable">
  <table class="dtable">
    <caption>Inference settings (Appendix B)</caption>
    <thead>
      <tr>
        <th scope="col">Setting</th>
        {#each MODELS as m (m.id)}<th scope="col">{m.name}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each st.rows as r (r[0])}
        <tr>
          <th scope="row">{r[0]}</th>
          {#each r.slice(1) as v, i (i)}<td>{v}</td>{/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<ul class="notes">
  {#each st.notes as n (n)}<li>{n}</li>{/each}
</ul>

<style>
  .models {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
    gap: 14px;
    margin: 22px 0 18px;
  }

  .mcard {
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    padding: 16px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .short {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  h4 {
    margin: 0;
    font-family: var(--serif);
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .role {
    margin: 0;
    color: var(--ink-2);
    font-size: 0.92rem;
  }

  .lm {
    margin: auto 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--rule);
    font-size: 0.86rem;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    align-items: baseline;
  }

  .lm .mono {
    overflow-wrap: anywhere;
  }

  .proto {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 12px 22px;
    margin: 0 0 22px;
    padding: 16px 0;
    border-top: 1px solid var(--rule);
    border-bottom: 1px solid var(--rule);
  }

  .proto dt {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 2px;
  }

  .proto dd {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .notes {
    margin: 10px 0 0;
    padding-left: 1.1em;
    color: var(--muted);
    font-size: 0.84rem;
    line-height: 1.5;
  }
</style>
