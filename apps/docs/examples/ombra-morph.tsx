import { resolveMorphEngine } from "@/components/ombra/morph";
import type { MorphEngine } from "@/components/ombra/types";

export function engineFor(requested: MorphEngine, reduced: boolean): MorphEngine {
  return resolveMorphEngine(requested, reduced);
}
