import { redirect } from "next/navigation";

// The public home is the live spills board ("Live now"). The old hub is hidden — /explore redirects
// straight to it. (Kept as a route so existing links to /explore still resolve.)
export default function ExploreHome() {
  redirect("/explore/spills");
}
