import type { Metadata } from "next";
import CampPlannerLoader from "@/features/camp-schedule/CampPlannerLoader";

export const metadata: Metadata = {
  title: "Camp Days",
  description: "Plan summer camps, care coverage, handoffs, and payments.",
};

export default function CampSchedulePage() {
  return <CampPlannerLoader />;
}
