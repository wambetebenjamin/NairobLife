/**
 * Static collision for the world, added straight to the Rapier world.
 *
 * @react-three/rapier's <RigidBody> and collider components are convenient for a
 * handful of objects, but each one is a React component with its own bookkeeping.
 * The city is thousands of immovable shapes that never change after loading, so we skip
 * the wrapper and create them in one effect, then remove them when the zone unloads.
 *
 * Colliders created without a parent body are fixed in place, which is exactly right.
 */
import type { Collider, ColliderDesc } from '@dimforge/rapier3d-compat'
import { useEffect } from 'react'
import { useRapier } from '@react-three/rapier'

type Rapier = ReturnType<typeof useRapier>['rapier']

/**
 * Build colliders once per change of `deps`. The builder receives the Rapier module (for
 * `ColliderDesc`) and returns the descriptions to add.
 */
export function useStaticColliders(
  build: (rapier: Rapier) => ColliderDesc[],
  deps: readonly unknown[],
): void {
  const { rapier, world } = useRapier()
  useEffect(() => {
    const colliders: Collider[] = build(rapier).map((desc) => world.createCollider(desc))
    return () => {
      for (const collider of colliders) {
        // The whole world may already be gone if <Physics> unmounted first.
        try {
          world.removeCollider(collider, false)
        } catch {
          /* world already freed */
        }
      }
    }
    // The builder is recreated every render; `deps` says when its inputs really change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapier, world, ...deps])
}
