import { redirect } from "next/navigation";

export default function PullRequestsRedirect() {
  redirect("/organizations");
}
