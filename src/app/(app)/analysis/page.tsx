import { redirect } from "next/navigation";

// Analysis was removed (Nov 2026): results are listed under Water quality → Results, and published
// sites with their classes are on the public Volunteer testing pages.
export default function MovedAnalysis() {
  redirect("/results");
}
