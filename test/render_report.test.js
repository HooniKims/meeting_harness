import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { resolvePythonCommand } from "../src/processes.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

async function renderPdf(t, markdown) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "meeting-harness-render-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const outputPath = path.join(outputDir, "meeting.pdf");
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "import fitz",
    "root = Path(sys.argv[1])",
    "sys.path.insert(0, str(root / 'workers'))",
    "from render_report import render_pdf",
    "output = Path(sys.argv[2])",
    "render_pdf(sys.argv[3], output, root)",
    "document = fitz.open(output)",
    "pages = []",
    "links = []",
    "spans = []",
    "for page in document:",
    "    pages.append({'text': page.get_text(), 'width': page.rect.width, 'height': page.rect.height})",
    "    links.extend(link.get('uri') for link in page.get_links() if link.get('uri'))",
    "    spans.extend(span for block in page.get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans'])",
    "print(json.dumps({'pages': pages, 'links': links, 'spans': spans}, ensure_ascii=True))"
  ].join("\n");
  const python = resolvePythonCommand();
  const result = spawnSync(
    python.command,
    [...python.prefixArgs, "-c", script, projectRoot, outputPath, markdown],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("render_pdf builds the approved meeting-record hierarchy", async (t) => {
  const markdown = [
    "# 성장형 해커톤 운영 회의록",
    "",
    "## 회의 개요",
    "- 회의명: 성장형 해커톤 운영 회의",
    "- 일시: 2026-08-17 14:00",
    "- 장소: 미래교육실",
    "- 참석자: 김교사, 이교사",
    "",
    "## 전체 요약",
    "핵심 일정과 역할을 **확정**하고 후속 과제를 정리했다.",
    "",
    "## 결정 사항",
    "### 최종 합의",
    "- 본문의 **굵은 강조**, *기울임*, `코드`, [참고 링크](https://example.com)를 확인한다.",
    "1. 첫 번째 후속 조치를 실행한다.",
    "",
    "| 담당 | 기한 | 상태 |",
    "|---|---|---|",
    "| 김교사 | 8월 20일 | 진행 |",
    "",
    "[추가 확인 필요: 장소 예약 여부]"
  ].join("\n");

  const rendered = await renderPdf(t, markdown);
  const text = rendered.pages.map((page) => page.text).join("\n");

  assert.match(text, /PROJECT MEETING RECORD/);
  assert.match(text, /성장형 해커톤 운영 회의록/);
  assert.match(text, /회의명/);
  assert.match(text, /2026-08-17 14:00/);
  assert.match(text, /전체 요약/);
  assert.match(text, /01\s+결정 사항/);
  assert.match(text, /◆\s*최종 합의/);
  assert.match(text, /담당\s+기한\s+상태/);
  assert.match(text, /추가 확인 필요/);
  assert.equal(text.includes("**"), false, "PDF still contains literal ** markers");
  assert.equal(text.includes("`"), false, "PDF still contains literal backtick markers");
  assert.equal(text.includes("[참고 링크]("), false, "PDF still contains literal link syntax");
  assert.equal(text.includes("|---|"), false, "PDF still contains Markdown table syntax");
  assert.equal(text.includes("<b>"), false, "PDF still contains a literal formatting tag");
  assert.ok(rendered.spans.some((span) => span.text === "확정" && span.font.includes("Bold")));
  assert.deepEqual(rendered.links, ["https://example.com"]);
  assert.ok(rendered.pages.every((page) => Math.abs(page.width - 595.276) < 0.1));
  assert.ok(rendered.pages.every((page) => Math.abs(page.height - 841.89) < 0.1));
  assert.match(rendered.pages[0].text, /01\s*\/\s*01/);
});

test("render_pdf numbers every page against the final page count", async (t) => {
  const tableRows = Array.from(
    { length: 90 },
    (_, index) => `| ${index + 1} | 담당자 ${index + 1} | 긴 후속 조치 내용을 확인하고 결과를 공유한다. |`
  );
  const markdown = [
    "# 장문 회의록",
    "",
    "## 회의 개요",
    "- 회의명: 장문 회의",
    "- 일시: 2026-08-17",
    "",
    "## 전체 요약",
    "긴 표와 여러 페이지의 머리글·바닥글을 검증한다.",
    "",
    "## 후속 조치",
    "| 번호 | 담당 | 내용 |",
    "|---:|---|---|",
    ...tableRows
  ].join("\n");

  const rendered = await renderPdf(t, markdown);
  assert.ok(rendered.pages.length >= 3);
  const total = String(rendered.pages.length).padStart(2, "0");
  rendered.pages.forEach((page, index) => {
    const current = String(index + 1).padStart(2, "0");
    assert.match(page.text, new RegExp(`${current}\\s*\\/\\s*${total}`));
    assert.match(page.text, /MEETING HARNESS/);
    assert.match(page.text, /장문 회의록/);
    assert.match(page.text, /번호\s+담당\s+내용/, "table header must repeat on each page");
  });
});
