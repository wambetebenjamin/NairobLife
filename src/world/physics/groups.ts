/**
 * Collision groups. Rapier packs "which groups am I in" and "which groups do I hit" into
 * one 32-bit number: memberships in the top 16 bits, filter in the bottom 16.
 *
 * World geometry keeps Rapier's default (in every group, hits every group). The player
 * and the vehicles each get a group of their own, so that a query can leave them out:
 * the camera looks past the player, a driven car ignores its driver.
 */
const ALL = 0xffff
const GROUP_PLAYER = 0x0002
const GROUP_VEHICLE = 0x0004

const groups = (memberships: number, filter: number) => ((memberships << 16) | filter) >>> 0

/** The player's capsule: in the player group, collides with everything. */
export const PLAYER_GROUPS = groups(GROUP_PLAYER, ALL)

/** A vehicle's box: in the vehicle group, collides with everything. */
export const VEHICLE_GROUPS = groups(GROUP_VEHICLE, ALL)

/** For rays and shape casts that should see the world but not the player. */
export const NOT_PLAYER_GROUPS = groups(ALL, ALL & ~GROUP_PLAYER)

/** For queries that should see only what never moves: no player, no vehicles. */
export const WORLD_ONLY_GROUPS = groups(ALL, ALL & ~GROUP_PLAYER & ~GROUP_VEHICLE)
