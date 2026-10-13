/** Split a target-first / reference-first pair at their shared "… so that" opening. */
export function splitPair(tf: string, rf: string) {
  const k = tf.indexOf(' so that ');
  if (k < 0 || rf.slice(0, k + 9) !== tf.slice(0, k + 9)) throw new Error(`wordings do not share an opening: ${tf} / ${rf}`);
  return { prefix: tf.slice(0, k + 8), S: tf.slice(k + 9), I: rf.slice(k + 9) };
}
