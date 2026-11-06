/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { StoreEditor } from '@ifc-lite/mutations';
import type { IfcDataStore } from '@ifc-lite/parser';
import { readStoreyInventory } from './storey-model.js';
import { planStoreyLevelEdit, type StoreyLevelEdit, type StoreyLevelPlan } from './storey-level-plan.js';
import { writeStoreyLevelPlan } from './storey-level-write.js';
import { StoreyEditRefusedError } from './storey-validation.js';

/** What makes two plans the same edit: the writes, not the counts shown beside them. */
export function storeyLevelPlanSignature(plan: StoreyLevelPlan): string {
  return JSON.stringify({
    storeys: plan.storeys.map(({ expressId, to }) => [expressId, Math.round(to * 1e6)]),
    placements: plan.placements.map(({ leaf, offset }) => [leaf.placementId, leaf.axisPlacementId, offset.map((v) => Math.round(v * 1e6))]),
    walls: plan.walls.map(({ wallId, to }) => [wallId, Math.round(to * 1e6)]),
    stairs: plan.stairs.map(({ stairId, to }) => [stairId, to.NumberOfRisers, Math.round(to.RiserHeight * 1e9)]),
  });
}

export interface StoreyLevelResult {
  readonly plan: StoreyLevelPlan;
  /** Products whose shape changed (resized walls and their openings, refit stairs). */
  readonly reshaped: readonly number[];
}

/**
 * Re-level a storey atomically: re-plan against the live overlay, refuse
 * (writing nothing) when the plan has a refusal or differs from `expected`,
 * otherwise write the placement lifts, storey Elevation attributes, attached
 * wall heights and stair refits.
 * The caller records the one compound operation for Undo.
 */
export function applyStoreyLevelEdit(
  store: IfcDataStore, editor: StoreEditor, edit: StoreyLevelEdit, expected?: StoreyLevelPlan,
): StoreyLevelResult {
  return editor.runAtomic((draft) => {
    const plan = planStoreyLevelEdit(readStoreyInventory(store, draft.getMutationView()), edit, { dryRun: false });
    if (plan.refusals.length) throw new StoreyEditRefusedError(plan.refusals);
    if (expected && storeyLevelPlanSignature(plan) !== storeyLevelPlanSignature(expected)) {
      throw new Error('The storey edit was planned against a model that has changed since; review it again');
    }
    return { plan, reshaped: writeStoreyLevelPlan(store, draft, plan) };
  });
}
