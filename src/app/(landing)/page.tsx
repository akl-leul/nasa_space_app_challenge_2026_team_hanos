import { Hero } from "@/components/landing/Hero";
import { Journey } from "@/components/landing/Journey";
import { LandingFrame } from "@/components/landing/LandingFrame";
import { Project } from "@/components/landing/Project";
import { Roster } from "@/components/landing/Roster";

export default function LandingPage() {
  return (
    <LandingFrame page="home">
      <Hero />
      <Journey />
      <Roster />
      <Project />
    </LandingFrame>
  );
}
