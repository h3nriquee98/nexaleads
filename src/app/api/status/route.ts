import { NextResponse } from "next/server";
import { getApifyConfig } from "@/server/config";
import { requestIsAuthorized } from "@/server/auth";
import { getAuthConfig } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Informa ao frontend quais fontes estão configuradas — sem nunca revelar tokens ou chaves. */
export async function GET(request: Request) {
  if (!(await requestIsAuthorized(request))) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: "Faça login novamente." }, { status: 401 });
  }
  const config = getApifyConfig();
  return NextResponse.json(
    {
      mode: config.demoMode ? "demo" : "live",
      sources: config.sources,
      actorId: config.actorId.replace("~", "/"),
      maxLeads: config.maxLeads,
      configError: config.configError,
      authRequired: getAuthConfig().required,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
