import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { ReportImportPanel } from "../features/reports/components/ReportImportPanel";

const payload=(id:string)=>JSON.stringify({schemaVersion:1,publications:[{id,contentId:null,platform:"facebook",accountId:"a",providerPostId:id,url:"https://facebook.com/"+id,title:id,publishedAt:"2026-10-09T00:00:00Z",mediaKind:"video",durationSeconds:30,thumbnailUrl:null}],observations:[]});
describe("report file selection",()=>{
 it("does not import an older slow file after a newer file was selected",async()=>{
  const repo=new MemoryDashboardRepository();
  render(<DashboardDataProvider repository={repo}><ReportImportPanel/></DashboardDataProvider>);
  fireEvent.click(screen.getByText(/นำเข้าไฟล์และจับคู่โพสต์/));
  let resolveOld!:(value:string)=>void;
  const old={size:100,text:()=>new Promise<string>(resolve=>{resolveOld=resolve;})};
  const fresh={size:100,text:async()=>payload("latest")};
  fireEvent.change(screen.getByLabelText("เลือกไฟล์รายงาน"),{target:{files:[old]}});
  fireEvent.change(screen.getByLabelText("เลือกไฟล์รายงาน"),{target:{files:[fresh]}});
  await screen.findByRole("button",{name:"ยืนยันนำเข้ารายงาน"});
  await act(async()=>resolveOld(payload("outdated")));
  fireEvent.click(screen.getByRole("button",{name:"ยืนยันนำเข้ารายงาน"}));
  await waitFor(async()=>expect((await repo.read()).reporting?.publications.map(p=>p.id)).toEqual(["latest"]));
 });
});
