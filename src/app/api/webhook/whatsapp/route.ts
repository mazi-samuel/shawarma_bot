import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processedMessages } from "@/lib/db/schema";
import { verifySignature, parseIncomingBatches } from "@/lib/whatsapp/webhook-handler";
import { handleIncomingMessage } from "@/lib/bot/state-machine";
import { getVendorByWhatsappPhoneNumberId } from "@/lib/vendor/vendor";

// One shared Meta App serves every vendor on the platform — each vendor's
// WhatsApp number is added as a phone number under this single app, so
// there's one webhook URL and one verify token/app secret for everyone.
// Routing to the right vendor happens per-message via phone_number_id.

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("WHATSAPP_APP_SECRET is not set");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const batches = parseIncomingBatches(payload);

  for (const batch of batches) {
    const vendor = await getVendorByWhatsappPhoneNumberId(batch.phoneNumberId);
    if (!vendor || !vendor.isActive) {
      console.warn("No active vendor for phone_number_id", batch.phoneNumberId);
      continue;
    }

    for (const msg of batch.messages) {
      try {
        // De-dupe: Meta may retry webhook delivery for the same message. Only
        // the request that successfully inserts the message id gets to process it.
        const inserted = await db
          .insert(processedMessages)
          .values({ messageId: msg.messageId })
          .onConflictDoNothing()
          .returning();
        if (inserted.length === 0) continue;

        await handleIncomingMessage(vendor, msg);
      } catch (err) {
        console.error("Failed to process WhatsApp message", msg.messageId, err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
