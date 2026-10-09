// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NeonLineReviewStore } from "../features/line-oa/server/line-review-store";
import { encryptLineUserId } from "../features/line-oa/server/line-user-encryption";
import type { SqlExecutor } from "../features/data/server/neon-client";

const encryptionKey=Buffer.alloc(32,17).toString("base64url");
const row={review_code:"R-ABC234",content_id:"c",cycle_id:"cycle",encrypted_recipient_user_id:encryptLineUserId("paired",encryptionKey),event_id:"line-webhook-event-1",event:"approved",comment:null,occurred_at:"2026-10-01T10:00:00Z",webhook_event_id:"event-1"};
const input={eventId:"event-1",senderUserId:"paired",decision:"approved" as const,comment:null,occurredAt:"2026-10-01T10:00:00.000Z"};
describe("durable LINE review decisions",()=>{
  it("stores a paired rejection without an active review in the unmatched feedback inbox", async () => {
    const execute = vi.fn<SqlExecutor>().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"line-inbox-event-1"}]);
    const result = await new NeonLineReviewStore({execute,encryptionKey}).recordLineReviewDecision({...input,decision:"correction-requested",comment:"ไม่ผ่าน"});
    expect(result).toEqual({status:"unmatched-recorded"});
    expect(execute.mock.calls[3][1]).toContain("ไม่ผ่าน");
    expect(execute.mock.calls[3][1]).not.toContain("paired");
  });
  it.each(["sending", "pending", "approved", "correction-requested"])("does not put an active %s review decision into the unmatched inbox", async (decision) => {
    const execute = vi.fn<SqlExecutor>().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{decision}]);
    expect(await new NeonLineReviewStore({execute,encryptionKey}).recordLineReviewDecision({...input,decision:"correction-requested",comment:"ไม่ผ่าน"})).toEqual({status:decision === "sending" ? "retry" : "ignored"});
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("never stores an approval without an active review as feedback", async () => {
    const execute = vi.fn<SqlExecutor>().mockResolvedValue([]);
    expect(await new NeonLineReviewStore({execute,encryptionKey}).recordLineReviewDecision(input)).toEqual({status:"ignored"});
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("recovers an approved webhook from its original review after another review becomes active",async()=>{
    const execute=vi.fn<SqlExecutor>().mockResolvedValueOnce([{review_code:"R-ABC234"}]).mockResolvedValueOnce([row]);
    const result=await new NeonLineReviewStore({execute,encryptionKey}).recordLineReviewDecision(input);
    expect(result).toMatchObject({status:"duplicate",review:{contentId:"c",cycleId:"cycle",events:[{event:"approved"}]}});
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("will not recover an approval for the wrong recipient",async()=>{
    const execute=vi.fn<SqlExecutor>().mockResolvedValueOnce([{review_code:"R-ABC234"}]).mockResolvedValueOnce([row]);
    expect(await new NeonLineReviewStore({execute,encryptionKey}).recordLineReviewDecision({...input,senderUserId:"stranger"})).toEqual({status:"ignored"});
  });
  it("rejects an empty correction and invalid provider timestamp before database access",async()=>{
    const execute=vi.fn<SqlExecutor>();const store=new NeonLineReviewStore({execute,encryptionKey});
    expect(await store.recordLineReviewDecision({...input,decision:"correction-requested",comment:"  "})).toEqual({status:"ignored"});
    expect(await store.recordLineReviewDecision({...input,occurredAt:"invalid"})).toEqual({status:"ignored"});
    expect(execute).not.toHaveBeenCalled();
  });
  it("passes first-decision, current-cycle, and provider-time guards in one atomic decision query",async()=>{
    const execute=vi.fn<SqlExecutor>().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{decision:"pending"}]);
    expect(await new NeonLineReviewStore({execute,encryptionKey}).recordLineReviewDecision({...input,reviewCode:"R-OLD234"})).toEqual({status:"ignored"});
    const [query,params]=execute.mock.calls[1];
    expect(query).toContain("a.decision = 'pending'");
    expect(query).toContain("r.created_at <= $5::timestamptz");
    expect(query).toContain("c->'lineReview'->>'activeCycleId' = r.cycle_id");
    expect(query).toContain("event IN ('approved', 'correction-requested')");
    expect(params).toEqual([expect.any(String),"event-1","approved",null,"2026-10-01T10:00:00.000Z","R-OLD234"]);
    expect(params).not.toContain("paired");
  });
  it("accepts a retried reply made after review creation but before delayed send confirmation", async () => {
    const createdAt = "2026-10-01T10:00:00.000Z";
    const repliedAt = "2026-10-01T10:00:05.000Z";
    const confirmedAt = "2026-10-01T10:00:30.000Z";
    let decision = "sending";
    let sentAt: string | null = null;
    const execute = vi.fn<SqlExecutor>(async (query, params) => {
      if (query.startsWith("SELECT review_code FROM line_review_events")) return [];
      if (query.includes("WITH finalized AS")) { decision = "pending"; sentAt = String(params[3]); return [{review_code: row.review_code}]; }
      if (query.includes("WITH changed AS")) {
        // The database boundary double evaluates the timestamp column used by the emitted SQL.
        const bound = query.match(/(r\.created_at|sent\.occurred_at) <= \$5::timestamptz/)?.[1];
        if (!bound) throw new Error("Decision query must enforce a timestamp bound");
        const minimumTime = bound === "r.created_at" ? createdAt : sentAt;
        if (decision !== "pending" || !sentAt || !minimumTime || String(params[4]) < minimumTime) return [];
        decision = String(params[2]);
        return [{review_code: row.review_code}];
      }
      if (query.startsWith("SELECT decision")) return [{decision}];
      if (query.startsWith("SELECT r.review_code")) return [{...row,occurred_at:repliedAt}];
      throw new Error("Unexpected review query");
    });
    const store = new NeonLineReviewStore({execute,encryptionKey});
    const reply = {...input,occurredAt:repliedAt};
    expect(await store.recordLineReviewDecision(reply)).toEqual({status:"retry"});
    await store.finishLineReviewSend(row.review_code,"paired",confirmedAt);
    expect(await store.recordLineReviewDecision({...reply,occurredAt:"2026-10-01T09:59:59.000Z"})).toEqual({status:"ignored"});
    expect(await store.recordLineReviewDecision(reply)).toMatchObject({status:"recorded",review:{events:[{event:"approved",occurredAt:repliedAt}]}});
  });
  it("persists snapshots without overwriting a review on duplicate registration",async()=>{
    const snapshot={content:{id:"c",caption:"reviewed"},media:[{id:"asset",externalUrl:"https://cdn.test/clip.mp4"}]};
    const execute=vi.fn<SqlExecutor>().mockResolvedValueOnce([]).mockResolvedValueOnce([{...row,snapshot}]);
    const result=await new NeonLineReviewStore({execute,encryptionKey}).registerLineReview({contentId:"c",cycleId:"cycle",reviewCode:"R-ABC234",recipientUserId:"paired",snapshot:snapshot as never});
    expect(result.snapshot).toEqual(snapshot);
    expect(execute.mock.calls[0][0]).toContain("ON CONFLICT (review_code) DO NOTHING");
    expect(JSON.parse(String(execute.mock.calls[0][1][4]))).toEqual(snapshot);
  });
});
