import { redirect } from "next/navigation";

/** Redirect old re-issuance URL to the merged documents page */
export default function ReissuanceRedirect() {
  redirect("/admin/documents?tab=reissuance");
}
