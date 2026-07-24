/**
 * The studio is the product. `/` opens it.
 *
 * This used to fetch the active project and redirect to `/p/<id>` — the old
 * project dashboard — which meant a fresh visitor never landed on the studio at
 * all; you had to know to type /studio. The dashboard is gone; the studio
 * resolves its own active project from the API, so no fetch is needed here.
 */

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/studio");
}
