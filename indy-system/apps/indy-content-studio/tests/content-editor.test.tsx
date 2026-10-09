import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentEditor } from "../features/content/components/ContentEditor";

describe("ContentEditor", () => {
  it("explains where the real LINE send happens without showing a no-op send button or invented recipient", () => {
    render(<ContentEditor assetState="ready" caption="ข้อความ" />);

    expect(screen.getByText("ไฟล์: พร้อม")).toBeVisible();
    expect(screen.getByText("แคปชัน: ข้อความ")).toBeVisible();
    expect(screen.getByText(/ส่งจริงทำจากรายละเอียดงาน/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "ส่งเข้า LINE OA" })).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIK GN/)).not.toBeInTheDocument();
  });
});
