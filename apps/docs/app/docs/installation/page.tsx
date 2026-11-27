import type { Metadata } from "next";

import { installation } from "../../../lib/getting-started";
import { GuidePage } from "../guide-page";

export const metadata: Metadata = {
  title: `${installation.title} — Ombra`,
  description: installation.description,
};

export default function InstallationPage() {
  return <GuidePage guide={installation} />;
}
