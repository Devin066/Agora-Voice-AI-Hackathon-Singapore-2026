"use client";

import dynamic from "next/dynamic";

const CareKakiApp = dynamic(
  () =>
    import("@/components/VoiceClient").then((mod) => ({
      default: mod.CareKakiApp,
    })),
  { ssr: false },
);

export default function GrandpaPage() {
  return <CareKakiApp mode="grandpa" />;
}
