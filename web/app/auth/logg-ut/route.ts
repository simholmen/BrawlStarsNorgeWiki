import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/origin";

// POST only (a form button), so a link or prefetch can't log anyone out.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/wiki/", publicOrigin(request)), 303);
}
