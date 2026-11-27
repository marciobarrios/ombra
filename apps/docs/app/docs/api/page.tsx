import type { Metadata } from "next";

import { apiReference } from "../../../lib/guides";
import { GuidePage } from "../guide-page";

export const metadata: Metadata = {
  title: `${apiReference.title} — Ombra`,
  description: apiReference.description,
};

export default function ApiReferencePage() {
  return <GuidePage guide={apiReference} />;
}
