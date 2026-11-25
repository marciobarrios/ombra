import type { Metadata } from "next";

import { anatomy } from "../../../lib/guides";
import { GuidePage } from "../guide-page";

export const metadata: Metadata = {
  title: `${anatomy.title} — Ombra`,
  description: anatomy.description,
};

export default function AnatomyPage() {
  return <GuidePage guide={anatomy} />;
}
