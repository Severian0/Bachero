import type { Metadata } from "next";
import CrewSettings from "@/components/CrewSettings";

export const metadata: Metadata = {
  title: "Crews and depots, Bachero",
  description: "Add the crews that repair potholes and place each one's depot on the map.",
};

export default function SettingsPage() {
  return <CrewSettings />;
}
