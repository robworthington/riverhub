import { redirect } from "next/navigation";

export default function Home() {
  // The public spills board is the landing page (middleware handles this first; this is a fallback).
  redirect("/explore/spills");
}
