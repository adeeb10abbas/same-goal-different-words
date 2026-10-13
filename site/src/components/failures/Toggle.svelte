<script lang="ts" generics="T extends string">
  /**
   * Labelled segmented control. `at` (em) switches to the short labels when the control's own box is narrower, so the
   * pill never wraps. Place it in a block or grid cell: it measures the width it is given, not its content.
   */
  let {
    label = '',
    group,
    options,
    value = $bindable(),
    at = 0,
  }: {
    label?: string;
    group: string;
    options: { v: T; full: string; short?: string; title?: string }[];
    value: T;
    at?: 0 | 14 | 16 | 18 | 20 | 22 | 24 | 26 | 28 | 30 | 32 | 34 | 36 | 40;
  } = $props();
</script>

<div class="tg at-{at}">
  {#if label}<span class="lbl" aria-hidden="true">{label}</span>{/if}
  <div class="seg full" role="group" aria-label={group}>
    {#each options as o (o.v)}
      <button type="button" aria-pressed={value === o.v} title={o.title} onclick={() => (value = o.v)}>{o.full}</button>
    {/each}
  </div>
  {#if at}
    <div class="seg short" role="group" aria-label={group}>
      {#each options as o (o.v)}
        <button type="button" aria-pressed={value === o.v} title={o.title ?? o.full} onclick={() => (value = o.v)}>{o.short ?? o.full}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tg {
    container-type: inline-size;
    display: grid;
    justify-items: start;
    gap: 6px;
    min-width: 0;
  }

  .lbl {
    color: var(--stage-muted);
  }

  .seg button {
    white-space: nowrap;
  }

  .short {
    display: none;
  }

  .short button {
    padding-inline: 10px;
  }

  @container (max-width: 14em) {
    .tg:global(.at-14) .full { display: none; }
    .tg:global(.at-14) .short { display: inline-flex; }
  }
  @container (max-width: 16em) {
    .tg:global(.at-16) .full { display: none; }
    .tg:global(.at-16) .short { display: inline-flex; }
  }
  @container (max-width: 18em) {
    .tg:global(.at-18) .full { display: none; }
    .tg:global(.at-18) .short { display: inline-flex; }
  }
  @container (max-width: 20em) {
    .tg:global(.at-20) .full { display: none; }
    .tg:global(.at-20) .short { display: inline-flex; }
  }
  @container (max-width: 22em) {
    .tg:global(.at-22) .full { display: none; }
    .tg:global(.at-22) .short { display: inline-flex; }
  }
  @container (max-width: 24em) {
    .tg:global(.at-24) .full { display: none; }
    .tg:global(.at-24) .short { display: inline-flex; }
  }
  @container (max-width: 26em) {
    .tg:global(.at-26) .full { display: none; }
    .tg:global(.at-26) .short { display: inline-flex; }
  }
  @container (max-width: 28em) {
    .tg:global(.at-28) .full { display: none; }
    .tg:global(.at-28) .short { display: inline-flex; }
  }
  @container (max-width: 30em) {
    .tg:global(.at-30) .full { display: none; }
    .tg:global(.at-30) .short { display: inline-flex; }
  }
  @container (max-width: 32em) {
    .tg:global(.at-32) .full { display: none; }
    .tg:global(.at-32) .short { display: inline-flex; }
  }
  @container (max-width: 34em) {
    .tg:global(.at-34) .full { display: none; }
    .tg:global(.at-34) .short { display: inline-flex; }
  }
  @container (max-width: 36em) {
    .tg:global(.at-36) .full { display: none; }
    .tg:global(.at-36) .short { display: inline-flex; }
  }
  @container (max-width: 40em) {
    .tg:global(.at-40) .full { display: none; }
    .tg:global(.at-40) .short { display: inline-flex; }
  }
</style>
