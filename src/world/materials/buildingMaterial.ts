/**
 * The facade material: thousands of buildings, zero textures.
 *
 * It is three's MeshLambertMaterial (cheap, per-pixel diffuse) with a few lines patched
 * into its shader. Windows are drawn procedurally from the `uv` and `facade` vertex
 * attributes that geometry/buildings.ts writes:
 *
 *   uv.x counts window bays along the wall, uv.y counts floors
 *   facade = (random seed, style, has ground-floor shops)
 *
 * Styles: 0 blank, 1 punched windows, 2 ribbon windows, 3 glass curtain wall, 4 glass in
 * tall strips between piers (FACADE in geometry/buildings.ts).
 * At night a share of the windows light up, whole floors at a time in the offices.
 *
 * TODO(art): signage. The ground-floor bands already carry hand-painted shop-sign
 * colours; real text ("M-PESA", hardware, salon) could come from a small atlas.
 */
import { Color, MeshLambertMaterial } from 'three'

/** Shared by every building material; Environment.tsx updates them once per frame. */
export const facadeUniforms = {
  /** Share of windows that are lit, 0..1. */
  uLit: { value: 0 },
  /** The sky as glass mirrors it: the sky's colour, a little greyed. */
  uGlass: { value: new Color(0.3, 0.4, 0.5) },
}

// `flat`: every vertex of a wall carries the same values, and the hashes below must see
// exactly those values. Interpolating them across a triangle wobbles the last few bits,
// which the hash turns into per-pixel static on the glass.
const VERTEX_PARS = /* glsl */ `
attribute vec3 facade;
varying vec2 vFacadeUv;
flat varying vec3 vFacade;
`

const VERTEX_MAIN = /* glsl */ `
vFacadeUv = uv;
vFacade = facade;
`

const FRAGMENT_PARS = /* glsl */ `
varying vec2 vFacadeUv;
flat varying vec3 vFacade;
uniform float uLit;
uniform vec3 uGlass;

float nlHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// 1 inside [lo, hi], antialiased over a width of e.
float nlBand(float lo, float hi, float x, float e) {
  return smoothstep(lo - e, lo + e, x) * (1.0 - smoothstep(hi - e, hi + e, x));
}

vec3 nlSign(float n) {
  // Hand-painted shopfront colours: red, yellow, M-Pesa green, blue, white, orange.
  if (n < 0.18) return vec3(0.52, 0.06, 0.05);
  if (n < 0.36) return vec3(0.72, 0.5, 0.05);
  if (n < 0.56) return vec3(0.06, 0.3, 0.1);
  if (n < 0.72) return vec3(0.05, 0.15, 0.4);
  if (n < 0.86) return vec3(0.66, 0.64, 0.6);
  return vec3(0.66, 0.24, 0.04);
}
`

const FRAGMENT_MAIN = /* glsl */ `
{
  float style = vFacade.y;
  float seed = vFacade.x;
  // How much of a window bay one pixel covers. Far away the grid cannot be resolved,
  // so fade to the average colour instead of letting it shimmer.
  // (Derivatives must be taken outside the branch below.)
  vec2 px = fwidth(vFacadeUv);
  if (style > 0.5) {
    vec2 cell = floor(vFacadeUv);
    vec2 f = vFacadeUv - cell;
    float detail = 1.0 - smoothstep(0.35, 0.9, max(px.x, px.y));
    vec2 e = clamp(px, vec2(0.0005), vec2(0.5));

    // Two numbers per building so that no two facades share the same proportions.
    float trait = fract(seed * 13.7);
    float trait2 = fract(seed * 29.3);

    float glass;
    float average;
    if (style < 1.5) {
      // Punched windows: one opening per bay, wider or narrower from building to building.
      float side = mix(0.14, 0.27, trait);
      float sill = mix(0.26, 0.38, trait2);
      glass = nlBand(side, 1.0 - side, f.x, e.x) * nlBand(sill, 0.84, f.y, e.y);
      average = (1.0 - 2.0 * side) * (0.84 - sill);
    } else if (style < 2.5) {
      // Ribbon windows: a continuous strip of glass per floor, split by slim mullions.
      float sill = mix(0.34, 0.46, trait);
      glass = nlBand(0.03, 0.97, f.x, e.x) * nlBand(sill, 0.88, f.y, e.y);
      average = 0.94 * (0.88 - sill);
    } else if (style < 3.5) {
      // Curtain wall: glass from slab to slab.
      float frame = mix(0.03, 0.06, trait);
      glass = nlBand(frame, 1.0 - frame, f.x, e.x) * nlBand(0.07, 0.93, f.y, e.y);
      average = (1.0 - 2.0 * frame) * 0.86;
    } else {
      // Piers: glass in strips that run the height of the wall, with solid piers between
      // them and only a hairline at each floor.
      float pier = mix(0.17, 0.27, trait);
      glass = nlBand(pier, 1.0 - pier, f.x, e.x) * nlBand(0.05, 0.97, f.y, e.y);
      average = (1.0 - 2.0 * pier) * 0.92;
    }

    vec3 wall = diffuseColor.rgb;
    float tone = nlHash(cell + seed * 37.0);
    // Glass has two parts. \`pane\` is paint: the dark room behind the window, lit by the
    // sun like any wall. \`mirror\` is the sky seen in the glass, which does not care
    // whether the wall is in sun or shade; it is added as light further down.
    vec3 pane = vec3(0.022, 0.025, 0.03) * (0.6 + 0.8 * tone);
    vec3 mirror = uGlass * 0.11 * (0.5 + tone);
    if (style > 2.5 && style < 3.5) {
      // Curtain wall: the vertex colour is the tint of the glass; the frame is its shadow.
      vec3 tint = wall / max(dot(wall, vec3(0.2126, 0.7152, 0.0722)), 0.04);
      pane = wall * 0.3 * (0.8 + 0.4 * tone);
      mirror = uGlass * mix(vec3(1.0), tint, 0.55) * 0.36 * (0.82 + 0.36 * tone);
      wall *= 0.32;
    } else {
      // Now and then somebody has drawn the blinds.
      float blind = step(0.84, nlHash(cell * 1.7 + seed * 11.0)) * 0.75;
      pane = mix(pane, wall * 0.62 + 0.02, blind);
      mirror *= 1.0 - blind;
    }

    // Ground floor: a row of shops, each with a painted sign band above the opening.
    float shop = step(0.5, vFacade.z) * step(cell.y, 0.5);
    float lit = 0.0;
    if (shop > 0.5) {
      float shopId = floor(cell.x * 0.5) + seed * 91.0;
      float opening = nlBand(0.06, 0.94, f.x, e.x) * nlBand(0.04, 0.62, f.y, e.y);
      float sign = nlBand(0.68, 0.93, f.y, e.y);
      wall = mix(wall, nlSign(nlHash(vec2(shopId, 3.0))), sign * detail);
      glass = opening;
      average = 0.5;
      // Shop openings are deep and shaded by their canopies: dark, with little reflection.
      pane = vec3(0.03, 0.03, 0.032);
      mirror = uGlass * 0.05;
      lit = step(nlHash(vec2(shopId, 9.0)), uLit * 1.9);
    } else {
      // Offices light up a floor at a time; flats light up window by window.
      float floorLit = nlHash(vec2(cell.y, seed * 53.0));
      float cellLit = nlHash(cell * 1.31 + seed * 17.0);
      lit = step(mix(cellLit, floorLit, 0.55), uLit);
    }

    float amount = mix(average, glass, detail);
    diffuseColor.rgb = mix(wall, pane, amount);
    totalEmissiveRadiance += mirror * amount;

    // Lamp colour varies by building: warm bulbs to cool fluorescent tubes.
    vec3 lamp = mix(vec3(1.0, 0.78, 0.46), vec3(0.78, 0.9, 1.0), step(0.6, fract(seed * 7.3)));
    totalEmissiveRadiance += lamp * lit * amount * (0.3 + 0.45 * tone) * step(0.001, uLit);

    // A soft shadow where the wall meets the street grounds the building.
    diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 0.9, vFacadeUv.y));
  }
}
`

export function createBuildingMaterial(): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = facadeUniforms.uLit
    shader.uniforms.uGlass = facadeUniforms.uGlass
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_MAIN}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_MAIN}`)
  }
  // Without this three would reuse the stock Lambert program and skip the patch.
  material.customProgramCacheKey = () => 'kanairo-facade-v4'
  return material
}
