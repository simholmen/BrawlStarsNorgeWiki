import { NextResponse } from "next/server";
import { getSearchIndex } from "@/lib/pageIndex";

// The page list for the search field in the page bar (components/PageNav.tsx). Public data, from
// the same cache as the pages themselves.

export async function GET() {
  return NextResponse.json(await getSearchIndex());
}
