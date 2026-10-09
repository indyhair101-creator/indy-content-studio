import { describe, expect, it } from "vitest";
import { bangkokDate, inReportRange, presetRange, previousRange, validDate } from "../features/reports/report-dates";
import { parseReportImport, mergeReportImport, validateReportingState } from "../features/reports/report-schema";
import { emptyReportingState } from "../features/reports/report-types";
import { reportCsv, saveReportSnapshot } from "../features/reports/report-export";
import { defaultReportFilters } from "../features/reports/report-dates";
const publication = { id:"p",contentId:null,platform:"instagram",accountId:"a",providerPostId:"42",url:"https://instagram.com/p/42",title:"Example",publishedAt:"2026-10-01T12:00:00Z",mediaKind:"video",durationSeconds:30,thumbnailUrl:null };
const observation = {id:"o",publicationId:"p",fetchedAt:"2026-10-09T00:00:00Z",source:"api",sourceLabel:"Instagram",scope:"lifetime",period:null,traffic:"unknown",metrics:{views:0,averageWatchSeconds:null},averageWatchWeight:null,retention:null};
const input=()=>({schemaVersion:1,publications:[publication],observations:[observation]});
describe("report contracts",()=>{
 it("uses Bangkok midnight and inclusive date windows",()=>{
  expect(bangkokDate("2026-10-08T17:00:00Z")).toBe("2026-10-09");
  expect(inReportRange("2026-10-09T16:59:59Z",{start:"2026-10-09",end:"2026-10-09"})).toBe(true);
  expect(inReportRange("2026-10-09T17:00:00Z",{start:"2026-10-09",end:"2026-10-09"})).toBe(false);
 });
 it("rejects impossible/reversed dates and compares equal inclusive days",()=>{
  expect(validDate("2026-02-30")).toBe(false);
  expect(previousRange({start:"2026-03-01",end:"2026-03-07"})).toEqual({start:"2026-02-22",end:"2026-02-28"});
  expect(()=>previousRange({start:"2026-03-07",end:"2026-03-01"})).toThrow();
  expect(presetRange("7d","2026-10-09T00:00:00Z")).toEqual({start:"2026-10-03",end:"2026-10-09"});
 });
 it("imports zeros without inventing missing values or trusted API provenance",()=>{
  const parsed=parseReportImport(JSON.stringify(input()));
  expect(parsed.observations[0].metrics.views).toBe(0);
  expect(parsed.observations[0].metrics.reach).toBeUndefined();
  expect(parsed.observations[0].source).toBe("import");
  expect(mergeReportImport(mergeReportImport(emptyReportingState(),parsed),parsed).observations).toHaveLength(1);
 });
 it("rejects unsafe links, invalid periods, orphan observations and impossible rates",()=>{
  expect(()=>parseReportImport({...input(),publications:[{...publication,url:"javascript:alert(1)"}]})).toThrow();
  expect(()=>parseReportImport({...input(),observations:[{...observation,scope:"activity",period:null}]})).toThrow();
  expect(()=>parseReportImport({...input(),observations:[{...observation,publicationId:"other"}]})).toThrow();
  expect(()=>parseReportImport({...input(),observations:[{...observation,metrics:{completionRate:101}}]})).toThrow();
  expect(()=>validateReportingState({...emptyReportingState(),token:"secret"})).toThrow();
 });
 it("does not silently replace conflicting publication identity",()=>{
  const parsed=parseReportImport(input());
  const current=mergeReportImport(emptyReportingState(),parsed);
  expect(()=>mergeReportImport(current,{...parsed,publications:[{...parsed.publications[0],providerPostId:"different"}]})).toThrow();
 });
 it("escapes CSV and freezes saved report inputs",()=>{
  expect(reportCsv(["name"],[["=HYPERLINK(\"bad\")"],["a,b"]])).toContain("'=HYPERLINK");
  expect(reportCsv(["name"],[["a,b"]])).toContain('"a,b"');
  const snapshot={value:1};
  const state=saveReportSnapshot(emptyReportingState(),{title:"October",kind:"content",filters:defaultReportFilters(),snapshot}, "r","2026-10-09T00:00:00Z");
  snapshot.value=99;
  expect(state.savedReports[0].snapshot).toEqual({value:1});
 });
});

