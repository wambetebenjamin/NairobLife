/**
 * Collision groups. Rapier packs "which groups am I in" and "which groups do I hit" into
 * one 32-bit number: memberships in the top 16 bits, filter in the bottom 16.
 *
 * World geometry keeps Rapier's default (in every group, hits every group). The player
 * gets a group of its own so that queries such as the camera's can skip it.
 *
 * TODO(vehicles): Phase 2 adds a GROUP_VEHICLE here so a driven car can ignore its driver.
 */
const ALL = 0xffff
const GROUP_PLAYER = 0x0002

const groups = (memberships: number, filter: number) => ((memberships << 16) | filter) >>> 0

/** The player's capsule: in the player group, collides with everything. */
export const PLAYER_GROUPS = groups(GROUP_PLAYER, ALL)

/** For rays and shape casts that should see the world but not the player. */
export const NOT_PLAYER_GROUPS = groups(ALL, ALL & ~GROUP_PLAYER)
