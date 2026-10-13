<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { onVisible, reducedMotion } from '../lib/sync';

  let {
    value,
    decimals = 0,
    sign = false,
    duration = 1500,
    delay = 0,
    from = 0,
  }: { value: number; decimals?: number; sign?: boolean; duration?: number; delay?: number; from?: number } = $props();

  const fmt = (x: number) => {
    const s = Math.abs(x).toFixed(decimals);
    const neg = x < 0 && Number(s) !== 0;
    if (!sign) return (neg ? '−' : '') + s;
    return (neg ? '−' : Number(s) === 0 ? '±' : '+') + s;
  };

  // svelte-ignore state_referenced_locally
  const tw = new Tween(value, { duration, easing: cubicOut });

  function attach(node: HTMLElement) {
    if (reducedMotion()) return;
    let armed = true;
    tw.set(from, { duration: 0 });
    return onVisible(
      node,
      (v) => {
        if (v && armed) {
          armed = false;
          tw.set(value, { delay, duration });
        }
      },
      0.6,
    );
  }
</script>

<span class="count num" {@attach attach}><span aria-hidden="true">{fmt(tw.current)}</span><span class="sr-only"
    >{fmt(value)}</span
  ></span>
