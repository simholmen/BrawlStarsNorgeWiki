import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getRole } from "@/lib/auth";

/** Editors only. Others get the login page or the ordinary not-found page. */
export async function requireEditorPage(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/logg-inn/?next=${encodeURIComponent(next)}`);
  const role = await getRole(user.id);
  if (!role) notFound();
  return { user, role };
}
