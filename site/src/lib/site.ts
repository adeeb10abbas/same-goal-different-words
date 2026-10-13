/** Publication metadata. Authors stay empty while the workshop review is anonymous. */
export const SITE = {
  title: 'Same Goal, Different Words',
  subtitle: 'Spatial Instruction Sensitivity in World-Action Models',
  /** The subtitle split before the hyphenated compound, so "World-Action" never breaks at its hyphen. */
  subtitleParts: ['Spatial Instruction Sensitivity in', 'World-Action Models'] as const,
  venue: 'CoRL 2026 Workshop',
  workshop: 'Do Robots Need World Models?',
  description:
    'Three world-action models receive the same goal in three equivalent wordings. Saying the target first places it 12 points more often than saying the reference first — and placements are often undone before the episode ends.',
  authors: [] as { name: string; url?: string; affiliation?: string }[],
  anonymous: true,
  paper: null as string | null,
  code: 'https://github.com/adeeb10abbas/world-action-model-steerability',
  bibtex: `@inproceedings{same_goal_different_words_2026,
  title     = {Same Goal, Different Words: Spatial Instruction Sensitivity in World-Action Models},
  author    = {Anonymous},
  booktitle = {CoRL 2026 Workshop: Do Robots Need World Models?},
  year      = {2026},
  note      = {Under review}
}`,
};
