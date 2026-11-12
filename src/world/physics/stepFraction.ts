/**
 * How far the frame being drawn is between two physics steps. Measured once a frame by
 * <StepClock>, which explains why it is needed and how it is found.
 */
let fraction = 1

/**
 * 0 at the physics step before last, 1 at the latest one. Draw a moving thing at
 * `previous + (current - previous) * stepFraction()`.
 */
export function stepFraction(): number {
  return fraction
}

export function setStepFraction(value: number): void {
  fraction = value
}
