/**
 * The five flagship series (Story 4.3) — the owner's 2026-09-25 pins. A
 * flagship archive series gets the spoiler-free preview at `/series/<id>` and
 * its result at `/series/<id>/result`; every other archived series gets the
 * single full-record page.
 *
 * Interim: Story 4.5's `series.is_featured` column replaces this list. Until
 * then it is the only source of flagship-ness — no migration in 4.3.
 */
export const FLAGSHIP_SERIES_IDS: readonly string[] = [
  'dd4e81bc-0e10-4ad2-b2eb-8b1fbd8c5e0a', // 2013 Finals, Heat–Spurs
  '06715a85-ec33-46a4-8383-d058055eefe6', // 2016 Finals, Cavaliers–Warriors
  '29638c4e-261a-4d09-81aa-5740f76175f5', // 2019 Eastern Conference Semifinals, Raptors–76ers
  '626257bc-1678-4c88-84a6-37e0a6cdb49c', // 2025 Finals, Thunder–Pacers
  '6ecb170c-e781-47f8-b7ee-881ba719d6d5', // 2026 Western Conference Finals, Thunder–Spurs
];

const FLAGSHIPS = new Set(FLAGSHIP_SERIES_IDS);

/** Whether a series id is one of the pinned flagships (uuids compare case-insensitively). */
export function isFlagship(id: string | null | undefined): boolean {
  return typeof id === 'string' && FLAGSHIPS.has(id.toLowerCase());
}
