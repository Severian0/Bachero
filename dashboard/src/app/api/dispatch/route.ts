import { DispatchError, createResendMailer, dispatch, validateDispatchRequest } from "@/lib/server/dispatch";
import { serverClient } from "@/lib/server/supabase";
import { contractorBaseUrl } from "@/lib/links";

const DEFAULT_FROM = "onboarding@resend.dev";

// POST /api/dispatch - docs/ARCHITECTURE.md section 5. All of the work is in
// src/lib/server/dispatch.ts; this only parses, injects I/O and maps errors.
//
// The crew link is built from the contractor portal's base URL, not this
// dashboard's: the crew screens live in `contractor/`, and the dashboard's
// /route/{id} is only a redirect kept alive for older bookmarks and emails.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const parsed = validateDispatchRequest(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  // Without a Resend key the plan is still published; the response says sent: false.
  const apiKey = process.env.RESEND_API_KEY;

  try {
    const result = await dispatch(
      {
        db: serverClient(),
        mailer: apiKey ? createResendMailer(apiKey) : null,
        appUrl: contractorBaseUrl(),
        from: process.env.DISPATCH_FROM_EMAIL ?? DEFAULT_FROM,
      },
      parsed,
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof DispatchError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "The database request failed." }, { status: 500 });
  }
}
