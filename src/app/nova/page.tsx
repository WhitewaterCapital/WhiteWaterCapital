import { redirect } from "next/navigation";

// Nova now lives on the WHITEWATCH war map (/war-map): the global threat map,
// intel feed, and the decisive 7-day predictions engine. This route used to be
// an empty placeholder; anyone who lands here (old link, typed URL) is sent to
// the real thing.
export default function NovaPage() {
  redirect("/war-map");
}
