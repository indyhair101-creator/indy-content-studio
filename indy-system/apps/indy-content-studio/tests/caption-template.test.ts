import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { addCaptionTemplate, addCaptionTemplateVersion, parseTemplateVariables } from "../features/captions/template-commands";
import { renderCaptionTemplate } from "../features/captions/render-template";

describe("caption templates", () => {
  it("renders supplied variables and reports missing variables in first-seen order", () => {
    expect(renderCaptionTemplate("เรียน {course} วันที่ {date}", { course: "ตัดผม", date: "20 ก.ย." })).toEqual({
      text: "เรียน ตัดผม วันที่ 20 ก.ย.",
      missing: [],
    });
    expect(renderCaptionTemplate("เรียน {course} กับ {date} และ {course}", {})).toEqual({
      text: "เรียน {course} กับ {date} และ {course}",
      missing: ["course", "date"],
    });
  });

  it("parses unique template variables in their first-seen order", () => {
    expect(parseTemplateVariables("{date} {course} {date} {course-name}")).toEqual(["date", "course", "course-name"]);
  });

  it("trims template input and rejects blank names and bodies", () => {
    const state = createEmptyDashboardState();
    const next = addCaptionTemplate(state, { id: "tpl-1", name: " เปิดคอร์ส ", body: " สมัคร {course} ", now: "now" });

    expect(next.captionTemplates[0]).toMatchObject({
      name: "เปิดคอร์ส",
      versions: [{ body: "สมัคร {course}", variables: ["course"] }],
    });
    expect(() => addCaptionTemplate(state, { id: "blank-name", name: " ", body: "body", now: "now" })).toThrow();
    expect(() => addCaptionTemplate(state, { id: "blank-body", name: "name", body: " \n ", now: "now" })).toThrow();
  });

  it("appends an immutable active version with the next version number", () => {
    const state = addCaptionTemplate(createEmptyDashboardState(), {
      id: "tpl-1",
      name: "เปิดคอร์ส",
      body: "สมัคร {course}",
      now: "created",
    });
    const template = {
      ...state.captionTemplates[0],
      versions: [
        state.captionTemplates[0].versions[0],
        { id: "tpl-1-v7", version: 7, body: "เวอร์ชันเจ็ด", variables: [], createdAt: "later" },
      ],
      activeVersionId: "tpl-1-v7",
    };
    const originalVersions = template.versions;
    const updated = addCaptionTemplateVersion(template, { id: "tpl-1-v8", body: " สมัคร {course} วันที่ {date} ", now: "latest" });

    expect(updated).not.toBe(template);
    expect(updated.versions).not.toBe(originalVersions);
    expect(updated.versions).toHaveLength(3);
    expect(updated.versions[0]).toBe(template.versions[0]);
    expect(updated.versions[1]).toBe(template.versions[1]);
    expect(updated.versions[2]).toEqual({
      id: "tpl-1-v8",
      version: 8,
      body: "สมัคร {course} วันที่ {date}",
      variables: ["course", "date"],
      createdAt: "latest",
    });
    expect(updated.activeVersionId).toBe("tpl-1-v8");
    expect(updated.updatedAt).toBe("latest");
  });
});
