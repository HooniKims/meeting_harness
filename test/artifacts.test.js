import assert from "node:assert/strict";
import test from "node:test";

import { buildShareReadyPdfFileName, selectShareReadyPdfTitle } from "../src/artifacts.js";

test("buildShareReadyPdfFileName sanitizes a user-provided Korean title", () => {
  assert.equal(
    buildShareReadyPdfFileName('2026 인공지능활용: 선도교사/연수? 웨비나.'),
    "2026 인공지능활용 선도교사 연수 웨비나.pdf"
  );
});

test("selectShareReadyPdfTitle prefers a specific meeting.md title over config defaults", () => {
  assert.equal(
    selectShareReadyPdfTitle({
      meetingInfo: { title: "webinar_combined_audio" },
      markdown: "# 2026 인공지능활용 선도교사 연수 웨비나\n\n## 회의 개요\n본문"
    }),
    "2026 인공지능활용 선도교사 연수 웨비나"
  );
});

test("selectShareReadyPdfTitle keeps config title when meeting.md title is generic", () => {
  assert.equal(
    selectShareReadyPdfTitle({
      meetingInfo: { title: "2026 인공지능활용 선도교사 연수 웨비나" },
      markdown: "# 회의록\n\n## 회의 개요\n본문"
    }),
    "2026 인공지능활용 선도교사 연수 웨비나"
  );
});
