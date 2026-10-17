import { conversationMessages } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ messages: await conversationMessages(params.id) }, { headers: { "Cache-Control": "no-store" } });
}
