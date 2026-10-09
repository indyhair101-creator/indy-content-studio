import { ActiveLineRecipientError, NeonLineConnectionRepository } from "../../../../features/line-oa/server/line-connection-repository";

function repository(): NeonLineConnectionRepository {
  return new NeonLineConnectionRepository();
}

export async function GET(): Promise<Response> {
  try {
    return Response.json(await repository().getConnectionStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "line_connection_unavailable" }, { status: 503 });
  }
}

export async function POST(): Promise<Response> {
  try {
    const repo = repository();
    const pairing = await repo.createPairingCode();
    return Response.json({ ...pairing, connection: await repo.getConnectionStatus() }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ActiveLineRecipientError) {
      return Response.json({ error: "recipient_already_connected" }, { status: 409 });
    }
    return Response.json({ error: "line_pairing_unavailable" }, { status: 503 });
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const repo = repository();
    await repo.resetConnection();
    return Response.json({ connection: await repo.getConnectionStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "line_connection_unavailable" }, { status: 503 });
  }
}
