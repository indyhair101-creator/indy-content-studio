export type ParsedLineReviewCommand =
  | { kind: "approve"; reviewCode?: string }
  | { kind: "correction"; reviewCode?: string; comment: string };

const reviewCode = "R-[A-Z0-9]{6}";

export function parseLineReviewCommand(input: string): ParsedLineReviewCommand | null {
  const text = input.trim();
  if (text === "ผ่าน") return { kind: "approve" };
  if (text === "ไม่ผ่าน") return { kind: "correction", comment: text };
  const rejection = text.match(/^ไม่ผ่าน\s+([\s\S]+)$/u);
  if (rejection?.[1].trim()) return { kind: "correction", comment: rejection[1].trim() };
  const approval = text.match(new RegExp(`^อนุมัติ\\s+(${reviewCode})$`, "u"));
  if (approval) return { kind: "approve", reviewCode: approval[1] };

  const correction = text.match(new RegExp(`^แก้ไข\\s+(${reviewCode}):\\s*(.+)$`, "u"));
  if (correction) return { kind: "correction", reviewCode: correction[1], comment: correction[2].trim() };
  return null;
}
