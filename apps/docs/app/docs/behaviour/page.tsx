import type { Metadata } from "next";

import { behaviour } from "../../../lib/styling-behaviour";
import { GuidePage } from "../guide-page";

export const metadata: Metadata = {
  title: `${behaviour.title} — Ombra`,
  description: behaviour.description,
};

export default function BehaviourPage() {
  return <GuidePage guide={behaviour} />;
}
