/**
 * /chronicle — superseded by the studio's WORLD view. Server redirect (no
 * client reload flash) — if this route ends up in browser history, back/
 * forward through it won't hard-reload the app the way window.location did.
 */

import { redirect } from "next/navigation";

export default function ChronicleRedirect() {
  redirect("/studio");
}
