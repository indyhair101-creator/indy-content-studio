// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminSessionToken } from "../features/auth/server/admin-session";
import { POST as sendReview } from "../app/api/line/send-review/route";
import { GET as listReviews } from "../app/api/line/reviews/route";

const data = vi.hoisted(() => ({status:"queued",send:vi.fn(),reviews:[] as any[]}));
vi.mock("../features/data/server/neon-dashboard-repository",()=>({NeonDashboardRepository:class {
  loadDashboardState=async()=>({version:1,state:{contents:[{id:"c",updatedAt:"2026-10-01T00:00:00Z",deletedAt:null,lineReview:{activeCycleId:"cycle",reviewCode:"R-ABC234",status:data.status}}]}});
}}));
vi.mock("../features/line-oa/server/line-delivery-service",async(importOriginal)=>({
  ...await importOriginal<typeof import("../features/line-oa/server/line-delivery-service")>(),
  LineDeliveryService:class {sendContentToLine=data.send;},
}));
vi.mock("../features/line-oa/server/line-review-store",()=>({getLineReview:async(code:string)=>data.reviews.find(item=>item.reviewCode===code)??null,listLineReviews:async()=>data.reviews}));
const authSecret="test-admin-secret-with-more-than-thirty-two-bytes";
const body={contentId:"c",cycleId:"cycle",reviewCode:"R-ABC234"};
beforeEach(()=>{
  vi.stubEnv("AUTH_SECRET",authSecret);vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN","test-token");
  data.status="queued";data.reviews=[];data.send.mockReset().mockResolvedValue({id:"delivery",status:"sent",errorCategory:null,sentAt:"2026-10-01T00:01:00Z",review:{...body}});
});
afterEach(()=>vi.unstubAllEnvs());
async function send(value:unknown=body) {
  const token=await createAdminSessionToken(authSecret);
  return sendReview(new Request("https://test/api/line/send-review",{method:"POST",headers:{cookie:`indy_admin_session=${token}`},body:JSON.stringify(value)}));
}
describe("compatible LINE review routes",()=>{
  it("requires admin authentication before accessing a delivery",async()=>{
    expect((await sendReview(new Request("https://test/api/line/send-review",{method:"POST",body:JSON.stringify(body)}))).status).toBe(401);
    expect(data.send).not.toHaveBeenCalled();
  });
  it("rejects browser message and recipient injection",async()=>{
    expect((await send({...body,recipientUserId:"attacker",messages:[]})).status).toBe(400);expect(data.send).not.toHaveBeenCalled();
  });
  it("checks the saved review cycle and rejects repeats",async()=>{
    expect((await send({...body,cycleId:"old"})).status).toBe(409);
    data.status="sent";expect((await send()).status).toBe(409);expect(data.send).not.toHaveBeenCalled();
  });
  it("delegates actual media sending to the same server delivery path",async()=>{
    const response=await send();expect(response.status).toBe(200);
    expect(data.send).toHaveBeenCalledWith({contentId:"c",expectedUpdatedAt:"2026-10-01T00:00:00Z",actorId:"primary-admin",review:{cycleId:"cycle",reviewCode:"R-ABC234"}});
    expect(await response.json()).toMatchObject({status:"sent",reviewCode:"R-ABC234",delivery:{status:"sent"}});
  });
  it("reports failed media delivery instead of marking the review sent",async()=>{
    data.send.mockResolvedValueOnce({status:"failed",errorCategory:"media_fetch"});
    expect((await send()).status).toBe(502);
  });
  it("does not expose recipient, webhook IDs, or the immutable review snapshot",async()=>{
    data.reviews=[{...body,recipientUserId:"U-private-cdef",snapshot:{content:{caption:"private"}},handledWebhookEventIds:["private-webhook"],events:[{id:"event",event:"sent",comment:null,occurredAt:"2026-10-01T00:00:00Z"}]}];
    const response=await listReviews(new Request("https://test/api/line/reviews"));
    expect(await response.json()).toEqual({reviews:[{...body,recipientMasked:"••••cdef",events:data.reviews[0].events}]});
  });
});
