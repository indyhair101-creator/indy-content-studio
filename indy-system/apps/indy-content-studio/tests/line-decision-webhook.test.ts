// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLineWebhookHandler } from "../features/line-oa/server/line-webhook-handler";
import type { StoredLineReview, ReviewDecisionInput } from "../features/line-oa/server/line-review-store";

const secret = "webhook-test-secret";
const previousSecret = process.env.LINE_CHANNEL_SECRET;
afterEach(() => { if (previousSecret === undefined) delete process.env.LINE_CHANNEL_SECRET; else process.env.LINE_CHANNEL_SECRET = previousSecret; });
function request(text = "ผ่าน", changes: Record<string, unknown> = {}) {
  process.env.LINE_CHANNEL_SECRET = secret;
  const body = JSON.stringify({events:[{type:"message",webhookEventId:"event-1",timestamp:Date.parse("2026-10-01T10:01:00Z"),source:{type:"user",userId:"paired"},message:{type:"text",text},...changes}]});
  return new Request("https://example.test/api/line/webhook",{method:"POST",headers:{"x-line-signature":createHmac("sha256",secret).update(body).digest("base64")},body});
}
const approved: StoredLineReview = {contentId:"c",cycleId:"cycle",reviewCode:"R-ABC234",recipientUserId:"paired",handledWebhookEventIds:["event-1"],events:[{id:"line-webhook-event-1",event:"approved",comment:null,occurredAt:"2026-10-01T10:01:00.000Z"}]};
function setup() {
  const enqueueApproval = vi.fn(async () => undefined);
  const recordDecision = vi.fn(async (_input: ReviewDecisionInput) => ({status:"recorded" as const,review:approved}));
  const handler = createLineWebhookHandler({getRepository:()=>({claimPairingCode:async()=>"paired",getActiveRecipient:async()=>"paired"}),recordDecision,enqueueApproval});
  return {handler,enqueueApproval,recordDecision};
}
describe("LINE decision webhook",()=>{
  it("uses provider event time and queues only persisted approval",async()=>{
    const {handler,recordDecision,enqueueApproval}=setup();
    expect((await handler(request())).status).toBe(200);
    expect(recordDecision).toHaveBeenCalledWith({eventId:"event-1",senderUserId:"paired",decision:"approved",comment:null,occurredAt:"2026-10-01T10:01:00.000Z"});
    expect(enqueueApproval).toHaveBeenCalledWith(approved);
  });
  it("returns 503 on failed enqueue and recovers duplicate persisted approval",async()=>{
    const {handler,recordDecision,enqueueApproval}=setup();
    enqueueApproval.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await handler(request())).status).toBe(503);
    recordDecision.mockResolvedValueOnce({status:"duplicate",review:approved} as never);
    expect((await handler(request())).status).toBe(200);
    expect(enqueueApproval).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["ไม่ผ่าน", "ไม่ผ่าน"],
    ["ไม่ผ่าน\nแก้ราคา", "แก้ราคา"],
  ])("records rejection %s without enqueueing a publication",async(text,comment)=>{
    const {handler,recordDecision,enqueueApproval}=setup();
    recordDecision.mockResolvedValueOnce({status:"recorded",review:{...approved,events:[{...approved.events[0],event:"correction-requested",comment}]}});
    expect((await handler(request(text))).status).toBe(200);
    expect(recordDecision).toHaveBeenCalledWith(expect.objectContaining({decision:"correction-requested",comment}));
    expect(enqueueApproval).not.toHaveBeenCalled();
  });
  it.each([
    ["ไม่ผ่านเพิ่มเติม",{}], ["ผ่านเพิ่มเติม",{}], ["ผ่าน",{source:{type:"group",userId:"paired"}}],
    ["ผ่าน",{source:{type:"user",userId:"stranger"}}], ["ผ่าน",{webhookEventId:undefined}], ["ผ่าน",{timestamp:undefined}],
  ])("ignores invalid or unauthorized reply %s",async(text,changes)=>{
    const {handler,recordDecision,enqueueApproval}=setup();
    expect((await handler(request(text as string, changes as Record<string,unknown>))).status).toBe(200);
    expect(recordDecision).not.toHaveBeenCalled();expect(enqueueApproval).not.toHaveBeenCalled();
  });
  it("asks LINE to redeliver while the latest clip is still sending",async()=>{
    const {handler,recordDecision,enqueueApproval}=setup();
    recordDecision.mockResolvedValueOnce({status:"retry"} as never);
    expect((await handler(request())).status).toBe(503);expect(enqueueApproval).not.toHaveBeenCalled();
  });
  it("acknowledges durable unmatched feedback without creating a publication",async()=>{
    const {handler,recordDecision,enqueueApproval}=setup();
    recordDecision.mockResolvedValueOnce({status:"unmatched-recorded"} as never);
    expect((await handler(request("ไม่ผ่าน"))).status).toBe(200);
    expect(enqueueApproval).not.toHaveBeenCalled();
  });
});
