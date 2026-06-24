import assert from "node:assert/strict";
import test from "node:test";

import { parseMeetingInfoText } from "../src/core.js";

test("parseMeetingInfoText parses bullet lists under metadata fields", () => {
  const info = parseMeetingInfoText(`
회의명: 2026 인공지능활용 선도교사 연수 웨비나
일시: 2026-06-24
참석자:
- 김OO: 강사
- 이OO: 선도교사
주요 안건:
- 1차시 운영
- 2차시 운영
특이사항: 실습 중심으로 정리한다.
`);

  assert.equal(info.title, "2026 인공지능활용 선도교사 연수 웨비나");
  assert.equal(info.dateTime, "2026-06-24");
  assert.deepEqual(info.attendees, ["김OO: 강사", "이OO: 선도교사"]);
  assert.deepEqual(info.agenda, ["1차시 운영", "2차시 운영"]);
  assert.equal(info.notes, "실습 중심으로 정리한다.");
});
