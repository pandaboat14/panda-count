"use client";

import { useMemo } from "react";
import type { UnitType } from "@/game/rules";
import { figureObject } from "./models";

// A unit figure for the battle scene: the same panda, armed panda, ogre and CAM as the board, in its side's colour.
export function Figure({ kind, color }: { kind: UnitType; color: string }) {
  const obj = useMemo(() => figureObject(kind, color), [kind, color]);
  return <primitive object={obj} scale={0.23} />;
}
