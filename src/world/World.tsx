/**
 * Everything that stands still: ground, buildings, flyovers, trees and the zone edge.
 * Must be rendered inside <Physics>, because each part registers its own collision.
 *
 * Vehicles are not here: they move, so they have a folder of their own (src/vehicles).
 *
 * TODO(matatus): matatu stages are in the zone data (file.pois, kind "stage", with SACCO
 * names and routes). A matatu is parked at each; Phase 3 runs routes between them.
 * TODO(traffic): the road graph for traffic AI comes from file.roads (one-way flags and
 * lane counts are already baked).
 */
import { Boundary } from './Boundary'
import { Buildings } from './Buildings'
import { Ground } from './Ground'
import { RaisedRoads } from './RaisedRoads'
import { Trees } from './Trees'
import type { LoadedZone } from './zone/loadZone'

export function World({ zone }: { zone: LoadedZone }) {
  return (
    <group name={`zone:${zone.id}`}>
      <Ground zone={zone} />
      <Buildings chunks={zone.geometry.chunks} />
      <RaisedRoads mesh={zone.geometry.raised} />
      <Trees trees={zone.geometry.trees} chunks={zone.geometry.treeChunks} />
      <Boundary bounds={zone.index.bounds} />
    </group>
  )
}
