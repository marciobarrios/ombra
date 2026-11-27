import type { Metadata } from "next";

import { styling } from "../../../lib/styling-behaviour";
import { GuidePage } from "../guide-page";

export const metadata: Metadata = {
  title: `${styling.title} — Ombra`,
  description: styling.description,
};

export default function StylingPage() {
  return <GuidePage guide={styling} />;
}
