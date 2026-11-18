/**
 * Whether this page runs inside the Kiro Crew desktop app, read from the
 * dashboard's own preload (`window.kirocrew`), as the dashboard does
 * (`website/src/lib/electron.ts` in Kiro Crew). Mochi's page shows its
 * desktop actions only there.
 */
const shell = (window as unknown as { kirocrew?: { isElectron?: boolean } }).kirocrew

export const isElectron = !!shell?.isElectron
