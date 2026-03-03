import { redirect } from "next/navigation";

/** Redirect old entity settings URL to the merged settings page */
export default function EntityRedirect() {
  redirect("/admin/settings?tab=branding");
}
