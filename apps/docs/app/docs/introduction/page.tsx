import type { Metadata } from "next";

import { introduction } from "../../../lib/getting-started";
import { GuidePage } from "../guide-page";

export const metadata: Metadata = {
  title: `${introduction.title} — Ombra`,
  description: introduction.description,
};

export default function IntroductionPage() {
  return <GuidePage guide={introduction} />;
}
