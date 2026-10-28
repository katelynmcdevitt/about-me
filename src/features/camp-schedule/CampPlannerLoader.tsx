"use client";

import dynamic from "next/dynamic";

const CampPlanner = dynamic(() => import("./CampPlanner"), {
  ssr: false,
  loading: () => (
    <p role="status" style={{ padding: "48px 24px" }}>
      Loading Camp Days…
    </p>
  ),
});

export default function CampPlannerLoader() {
  return <CampPlanner />;
}
