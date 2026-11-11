/**
 * Measurements shared by the character model and the camera.
 */
import { CAMERA } from '../config/game'

/** How far the character's hips (and so the head) drop in a full crouch, in metres. */
export const CROUCH_DROP = 0.37

/** Height of the third-person camera's pivot above the feet, following the crouch. */
export function pivotHeight(crouching: boolean): number {
  return crouching ? CAMERA.targetHeight - CROUCH_DROP - 0.1 : CAMERA.targetHeight
}
