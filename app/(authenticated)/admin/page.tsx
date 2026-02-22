import { redirect } from "next/navigation";

/** Admin root redirects to the investors list */
export default function AdminPage() {
  redirect("/admin/investors");
}
