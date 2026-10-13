<script lang="ts">
  import { tokenize, type Goal } from '../lib/study';

  let { prompt, goal, tag = 'span' }: { prompt: string; goal: Pick<Goal, 'mover' | 'reference'>; tag?: string } =
    $props();
  const tokens = $derived(tokenize(prompt, goal));
</script>

<svelte:element this={tag} class="instr"
  >{#each tokens as t}{#if t.kind === 'plain'}{t.text}{:else}<span class="tok-{t.kind}">{t.text}</span
      >{/if}{/each}</svelte:element
>

<style>
  .instr {
    font-family: var(--serif);
  }
</style>
