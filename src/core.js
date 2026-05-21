import path from "node:path";

export const requiredMeetingSections = [
  "회의 개요",
  "전체 요약",
  "회의 흐름",
  "주요 안건별 논의",
  "공통 의견",
  "이견 및 쟁점",
  "결정 사항",
  "후속 조치"
];

const fieldMap = new Map([
  ["회의명", "title"],
  ["제목", "title"],
  ["일시", "dateTime"],
  ["회의일시", "dateTime"],
  ["날짜", "dateTime"],
  ["장소", "location"],
  ["참석자", "attendees"],
  ["참석", "attendees"],
  ["주요 안건", "agenda"],
  ["안건", "agenda"],
  ["보고 대상", "audience"],
  ["보고대상", "audience"],
  ["문서 톤", "tone"],
  ["톤", "tone"],
  ["특이사항", "notes"]
]);

export function buildWorkspaceName(inputFile, date = new Date()) {
  const parsed = path.parse(inputFile);
  const base = parsed.name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${base || "meeting"}_${formatTimestamp(date)}`;
}

export function formatTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}${pick("month")}${pick("day")}_${pick("hour")}${pick("minute")}`;
}

export function parseMeetingInfoText(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
    if (!match) continue;

    const rawKey = match[1].trim();
    const value = match[2].trim();
    const key = fieldMap.get(rawKey);
    if (!key || !value) continue;

    if (key === "attendees" || key === "agenda") {
      result[key] = splitList(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function splitList(value) {
  return value
    .split(/[,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateMeetingMarkdown(markdown) {
  const failures = [];
  const sections = parseMarkdownSections(markdown);

  for (const section of requiredMeetingSections) {
    if (!sections.has(section)) {
      failures.push(`${section} 섹션 누락`);
      continue;
    }
    const content = sections.get(section).trim();
    if (!content) failures.push(`${section} 섹션 비어 있음`);
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

export function parseMarkdownSections(markdown) {
  const sections = new Map();
  const lines = markdown.split(/\r?\n/);
  let current = null;
  let buffer = [];

  const flush = () => {
    if (current) sections.set(current, buffer.join("\n"));
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      current = match[1].trim();
      buffer = [];
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();

  return sections;
}
