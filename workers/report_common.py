from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


REQUIRED_SECTIONS = [
    "회의 개요",
    "전체 요약",
    "회의 흐름",
    "주요 안건별 논의",
    "공통 의견",
    "이견 및 쟁점",
    "결정 사항",
    "후속 조치",
]


@dataclass(frozen=True, slots=True)
class MarkdownBlock:
    level: int
    title: str
    lines: list[str]

    @property
    def text(self) -> str:
        return "\n".join(self.lines).strip()


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
METADATA_RE = re.compile(r"^[-*]\s*([^:：]+?)\s*[:：]\s*(.*?)\s*$")
TABLE_SEPARATOR_RE = re.compile(r"^:?-{3,}:?$")


def parse_markdown(markdown: str) -> tuple[str, list[MarkdownBlock]]:
    title = "회의록"
    blocks: list[MarkdownBlock] = []
    current: MarkdownBlock | None = None

    for index, raw_line in enumerate(markdown.splitlines()):
        if index == 0:
            raw_line = raw_line.lstrip("\ufeff")
        match = HEADING_RE.match(raw_line)
        if match:
            level = len(match.group(1))
            heading = match.group(2).strip()
            if level == 1 and not blocks and current is None:
                title = heading
                continue
            if current is not None:
                blocks.append(current)
            current = MarkdownBlock(level=level, title=heading, lines=[])
            continue
        if current is None:
            if raw_line.strip():
                current = MarkdownBlock(level=2, title="본문", lines=[raw_line])
        else:
            current.lines.append(raw_line)

    if current is not None:
        blocks.append(current)
    return title, blocks


def section_map(blocks: list[MarkdownBlock]) -> dict[str, MarkdownBlock]:
    return {block.title.strip(): block for block in blocks}


def parse_meeting_metadata(lines: list[str]) -> list[tuple[str, str]]:
    metadata: list[tuple[str, str]] = []
    for line in lines:
        match = METADATA_RE.match(line.strip())
        if match and match.group(2):
            metadata.append((match.group(1).strip(), match.group(2).strip()))
    return metadata


def split_table_row(line: str) -> list[str]:
    stripped = line.strip().strip("|")
    return [cell.strip() for cell in stripped.split("|")]


def parse_markdown_table(
    lines: list[str], start: int
) -> tuple[list[list[str]], int] | None:
    if start + 1 >= len(lines) or "|" not in lines[start]:
        return None
    header = split_table_row(lines[start])
    separator = split_table_row(lines[start + 1])
    if len(header) < 2 or len(separator) != len(header):
        return None
    if not all(TABLE_SEPARATOR_RE.fullmatch(cell.replace(" ", "")) for cell in separator):
        return None

    rows = [header]
    index = start + 2
    while index < len(lines) and "|" in lines[index]:
        row = split_table_row(lines[index])
        if len(row) != len(header):
            break
        rows.append(row)
        index += 1
    return rows, index


def find_font_file(base_dir: Path, weight_fragment: str = "4Regular") -> Path | None:
    candidates = [
        base_dir / "fonts",
        base_dir.parent / "fonts",
        base_dir.parent.parent / "fonts",
        base_dir / "assets" / "fonts",
        base_dir / "assets" / "fonts" / "Paperlogy",
        base_dir.parent / "assets" / "fonts",
        base_dir.parent / "assets" / "fonts" / "Paperlogy",
    ]
    for folder in candidates:
        if not folder.exists():
            continue
        matches = sorted(folder.glob(f"Paperlogy-*{weight_fragment}.ttf"))
        if matches:
            return matches[0]
    return None
