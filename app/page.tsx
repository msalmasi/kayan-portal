import { redirect } from "next/navigation";

/** Root path redirects to the dashboard — middleware handles auth */
export default function HomePage() {
  redirect("/dashboard");
}
