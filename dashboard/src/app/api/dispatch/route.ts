import { DispatchError, createResendMailer, dispatch, validateDispatchRequest } from "@/lib/server/dispatch";
import { serverClient } from "@/lib/server/supabase";

const DEFAULT_FROM = "onboarding@resend.dev";
const DEFAULT_APP_URL = "http://localhost:3000";

// POST /api/dispatch — docs/ARCHITECTURE.md §5. All of the work is in
// src/lib/server/dispatch.ts; this only parses, injects I/O and maps errors.
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
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL,
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
