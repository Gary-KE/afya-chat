import { listConversations } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dashboard data. Protected by the password check in middleware.ts. */
export async function GET() {
  return Response.json({ conversations: await listConversations(50) }, { headers: { "Cache-Control": "no-store" } });
}
