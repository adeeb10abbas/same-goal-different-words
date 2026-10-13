<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Full-viewport modal <dialog> holding one dark sheet. Esc and a click outside the sheet call `onclose`; Tab wraps
   * inside the sheet; the page behind does not scroll. `[data-autofocus]` inside the content receives focus on open.
   */
  let { open, label, onclose, children }: { open: boolean; label: string; onclose: () => void; children: Snippet } = $props();

  let dlg: HTMLDialogElement;
  let downOnBackdrop = false;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function lock(on: boolean) {
    const h = document.documentElement;
    if (on) {
      const gutter = innerWidth - h.clientWidth > 0;
      h.style.overflow = 'hidden';
      if (gutter) h.style.scrollbarGutter = 'stable';
    } else {
      h.style.overflow = '';
      h.style.scrollbarGutter = '';
    }
  }

  $effect(() => {
    if (open && !dlg.open) {
      dlg.showModal();
      lock(true);
      requestAnimationFrame(() => dlg.querySelector<HTMLElement>('[data-autofocus]')?.focus());
    } else if (!open && dlg.open) {
      dlg.close();
      lock(false);
    }
  });
  $effect(() => () => lock(false));

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const f = [...dlg.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length && !x.closest('[inert]'));
    if (!f.length) return;
    const a = document.activeElement;
    if (e.shiftKey && (a === f[0] || a === dlg)) {
      e.preventDefault();
      f[f.length - 1].focus();
    } else if (!e.shiftKey && a === f[f.length - 1]) {
      e.preventDefault();
      f[0].focus();
    }
  }
</script>

<dialog
  bind:this={dlg}
  class="modal"
  aria-label={label}
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
  onclose={() => {
    if (open) onclose();
  }}
  onpointerdown={(e) => (downOnBackdrop = e.target === dlg)}
  onclick={(e) => {
    if (downOnBackdrop && e.target === dlg) onclose();
    downOnBackdrop = false;
  }}
  {onkeydown}
>
  {#if open}
    <div class="sheet dark" data-qa-scroll>
      {@render children()}
    </div>
  {/if}
</dialog>

<style>
  .modal {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 24px;
    border: 0;
    background: transparent;
    color: var(--stage-ink);
    overflow: hidden;
  }

  .modal[open] {
    display: grid;
    place-items: center;
  }

  .modal::backdrop {
    background: rgb(8 9 12 / 74%);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  .sheet {
    position: relative;
    width: min(1280px, 100%);
    height: 100%;
    max-height: 940px;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--stage);
    color: var(--stage-ink);
    color-scheme: dark;
    border: 1px solid var(--stage-rule);
    border-radius: 18px;
    box-shadow: 0 30px 80px -20px rgb(0 0 0 / 70%);
    animation: rise 0.28s var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.99);
    }
  }

  @media (max-width: 640px) {
    .modal {
      padding: 0;
    }

    .sheet {
      width: 100%;
      max-height: none;
      border: 0;
      border-radius: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet {
      animation: none;
    }
  }
</style>
