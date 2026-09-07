const GRAPH_API_VERSION = "v21.0";

export interface WhatsAppCredentials {
  phoneNumberId: string;
  token: string;
}

function apiUrl(phoneNumberId: string): string {
  // Overridable so local/CI testing can point this at a mock server instead
  // of the real Graph API — never set in production.
  const base = process.env.WHATSAPP_GRAPH_BASE_URL ?? "https://graph.facebook.com";
  return `${base}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
}

async function callGraphApi(
  creds: WhatsAppCredentials,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(apiUrl(creds.phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API error (${res.status}): ${errText}`);
  }
}

export async function sendText(creds: WhatsAppCredentials, to: string, body: string): Promise<void> {
  await callGraphApi(creds, {
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export async function sendInteractiveList(
  creds: WhatsAppCredentials,
  to: string,
  opts: {
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttonLabel: string;
    sections: ListSection[];
  }
): Promise<void> {
  await callGraphApi(creds, {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(opts.headerText ? { header: { type: "text", text: opts.headerText } } : {}),
      body: { text: opts.bodyText },
      ...(opts.footerText ? { footer: { text: opts.footerText } } : {}),
      action: {
        button: opts.buttonLabel,
        sections: opts.sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title,
            ...(r.description ? { description: r.description } : {}),
          })),
        })),
      },
    },
  });
}

export interface ReplyButton {
  id: string;
  title: string;
}

export async function sendInteractiveButtons(
  creds: WhatsAppCredentials,
  to: string,
  bodyText: string,
  buttons: ReplyButton[]
): Promise<void> {
  await callGraphApi(creds, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

export async function markMessageAsRead(creds: WhatsAppCredentials, messageId: string): Promise<void> {
  await callGraphApi(creds, {
    status: "read",
    message_id: messageId,
  });
}
