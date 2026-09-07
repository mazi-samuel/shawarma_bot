#!/bin/bash
# Simulates an inbound WhatsApp message hitting /api/webhook/whatsapp, signed
# the same way Meta signs real webhook deliveries. Useful for exercising the
# bot's conversation flow without a real WhatsApp Business number.
#
# Usage: ./scripts/simulate-whatsapp-message.sh <phone_number_id> <from> <text> [message_id]
#
# Requires WHATSAPP_APP_SECRET to match what your local server is running
# with (see .env.local), and the target app running at $BASE_URL (default
# http://localhost:3000).

set -e

PHONE_NUMBER_ID="${1:?Usage: $0 <phone_number_id> <from> <text> [message_id]}"
FROM="${2:?Usage: $0 <phone_number_id> <from> <text> [message_id]}"
TEXT="${3:?Usage: $0 <phone_number_id> <from> <text> [message_id]}"
MESSAGE_ID="${4:-wamid.$(date +%s%N)}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${WHATSAPP_APP_SECRET:?Set WHATSAPP_APP_SECRET to match your local .env.local}"

BODY=$(cat <<EOF
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "metadata": { "phone_number_id": "$PHONE_NUMBER_ID" },
        "contacts": [{ "profile": { "name": "Test Customer" }, "wa_id": "$FROM" }],
        "messages": [{ "from": "$FROM", "id": "$MESSAGE_ID", "type": "text", "text": { "body": "$TEXT" } }]
      }
    }]
  }]
}
EOF
)

SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -s -X POST "$BASE_URL/api/webhook/whatsapp" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$BODY"
echo
