type LineWebhookEvent = {
  type?: string;
  webhookEventId?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

const pairingCommandPattern = /^เชื่อมต่อ\s+(INDY-[A-F0-9]{8}-[A-F0-9]{8})$/u;

export function parseLinePairingEvent(
  event: LineWebhookEvent,
): { pairingCode: string; recipientUserId: string } | null {
  if (
    event.type !== "message" ||
    event.source?.type !== "user" ||
    !event.source.userId ||
    event.message?.type !== "text" ||
    !event.message.text
  ) return null;

  const command = event.message.text.trim().match(pairingCommandPattern);
  return command ? { pairingCode: command[1], recipientUserId: event.source.userId } : null;
}

export function extractPairingEvent(
  event: LineWebhookEvent,
  pairingCode: string,
): { recipientUserId: string } | null {
  const expectedMessage = `เชื่อมต่อ ${pairingCode}`;

  if (
    event.type !== "message" ||
    event.source?.type !== "user" ||
    !event.source.userId ||
    event.message?.type !== "text" ||
    event.message.text?.trim() !== expectedMessage
  ) {
    return null;
  }

  return { recipientUserId: event.source.userId };
}
