/** Publication metadata. `aff` indexes are 1-based positions in `affiliations`. */
export const SITE = {
  title: 'Same Goal, Different Words',
  subtitle: 'Spatial Instruction Sensitivity in World-Action Models',
  /** The subtitle split before the hyphenated compound, so "World-Action" never breaks at its hyphen. */
  subtitleParts: ['Spatial Instruction Sensitivity in', 'World-Action Models'] as const,
  venue: 'CoRL 2026 Workshop',
  workshop: 'Do Robots Need World Models?',
  description:
    'Three world-action models receive the same goal in three equivalent wordings. Saying the target first places it 12 points more often than saying the reference first — and placements are often undone before the episode ends.',
  authors: [
    { name: 'Ali-Adeeb Abbas', aff: [1, 2] },
    { name: 'Esmaeil Seraj', aff: [1] },
    { name: 'Behrad Toghi', aff: [1] },
    { name: 'Taskin Padir', aff: [2] },
  ] as { name: string; url?: string; aff: number[] }[],
  affiliations: ['General Motors', 'RIVeR Lab, Northeastern University'],
  /**
   * Affiliation logos in `affiliations` order, drawn as white silhouettes in the heroes. Files in public/logos/ are
   * from Wikimedia Commons; `ratio` is each file's width / height.
   */
  logos: [
    { src: 'logos/gm.svg', ratio: 229.557 / 61.167 },
    { src: 'logos/northeastern.svg', ratio: 247 / 78.865 },
  ],
  contact: 'abbas.a@northeastern.edu',
  anonymous: false,
  paper: null as string | null,
  code: 'https://github.com/adeeb10abbas/world-action-model-steerability',
  bibtex: `@inproceedings{same_goal_different_words_2026,
  title     = {Same Goal, Different Words: Spatial Instruction Sensitivity in World-Action Models},
  author    = {Abbas, Ali-Adeeb and Seraj, Esmaeil and Toghi, Behrad and Padir, Taskin},
  booktitle = {CoRL 2026 Workshop: Do Robots Need World Models?},
  year      = {2026},
  note      = {Under review}
}`,
};
