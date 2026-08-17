from __future__ import annotations

import html
import re
from typing import Final

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, Paragraph, Spacer, Table, TableStyle

from report_common import MarkdownBlock, parse_markdown_table
from report_theme import (
    BLUE,
    HIGHLIGHT,
    LINE,
    NAVY,
    PAGE_SIDE_MARGIN,
    PAPER,
    SOFT_BLUE,
)


CODE_RE: Final = re.compile(r"`([^`\n]+)`")
STRONG_RE: Final = re.compile(r"\*\*([^*\n]+)\*\*")
LINK_RE: Final = re.compile(r"\[([^]\n]+)\]\(([^)\n]+)\)")
EMPHASIS_RE: Final = re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")
ORDERED_RE: Final = re.compile(r"^(\d+)[.)]\s+(.+)$")
CALLOUT_RE: Final = re.compile(r"^\[추가 확인 필요:\s*(.+)]$")
CONTENT_WIDTH: Final = A4[0] - 2 * PAGE_SIDE_MARGIN


def render_pdf_inline(markdown: str, regular_font: str) -> str:
    escaped = html.escape(markdown)
    code_fragments: list[str] = []

    def protect_code(match: re.Match[str]) -> str:
        code_fragments.append(
            f'<font name="{regular_font}" backColor="#EEF1F5">{match.group(1)}</font>'
        )
        return f"@@CODE{len(code_fragments) - 1}@@"

    rendered = CODE_RE.sub(protect_code, escaped)
    rendered = STRONG_RE.sub(
        f'<font backColor="{HIGHLIGHT.hexval()}"><b>\\1</b></font>', rendered
    )
    rendered = LINK_RE.sub(r'<link href="\2" color="#3F74C0"><u>\1</u></link>', rendered)
    rendered = EMPHASIS_RE.sub(r"<i>\1</i>", rendered)
    for index, fragment in enumerate(code_fragments):
        rendered = rendered.replace(f"@@CODE{index}@@", fragment)
    return rendered


def info_card(metadata: list[tuple[str, str]], styles, regular_font: str) -> Table | None:
    if not metadata:
        return None
    cells = []
    for label, value in metadata:
        cells.append([
            Paragraph(render_pdf_inline(label, regular_font), styles["card_label"]),
            Paragraph(render_pdf_inline(value, regular_font), styles["card_value"]),
        ])
    rows = [cells[index:index + 2] for index in range(0, len(cells), 2)]
    if len(rows[-1]) == 1:
        rows[-1].append("")
    table = Table(rows, colWidths=[CONTENT_WIDTH / 2] * 2, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2 * mm),
    ]))
    return table


def summary_card(lines: list[str], styles, regular_font: str) -> Table | None:
    text = "<br/>".join(render_pdf_inline(line.strip(), regular_font) for line in lines if line.strip())
    if not text:
        return None
    content = [Paragraph("전체 요약", styles["summary_label"]), Paragraph(text, styles["summary"])]
    table = Table([[content]], colWidths=[CONTENT_WIDTH], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT_BLUE),
        ("LINEBEFORE", (0, 0), (0, -1), 3, BLUE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ]))
    return table


def section_bar(number: int, title: str, styles, regular_font: str) -> Table:
    table = Table(
        [[Paragraph(f"{number:02d}", styles["section_number"]),
          Paragraph(render_pdf_inline(title, regular_font), styles["section"])]],
        colWidths=[13 * mm, CONTENT_WIDTH - 13 * mm], hAlign="LEFT",
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), BLUE),
        ("BACKGROUND", (1, 0), (1, 0), SOFT_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
    ]))
    table.keepWithNext = True
    return table


def content_table(rows: list[list[str]], styles, regular_font: str) -> LongTable:
    count = len(rows[0])
    ratios = [0.18, 0.24, 0.58] if count == 3 else [1 / count] * count
    data = []
    for row_index, row in enumerate(rows):
        style = styles["table_head"] if row_index == 0 else styles["table_body"]
        data.append([Paragraph(render_pdf_inline(cell, regular_font), style) for cell in row])
    table = LongTable(data, colWidths=[CONTENT_WIDTH * ratio for ratio in ratios], repeatRows=1)
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2 * mm),
    ]
    for row_index in range(2, len(rows), 2):
        commands.append(("BACKGROUND", (0, row_index), (-1, row_index), PAPER))
    table.setStyle(TableStyle(commands))
    return table


def block_flowables(block: MarkdownBlock, section_number: int, styles, regular_font: str):
    items = []
    if block.level == 2:
        items.extend([Spacer(1, 2 * mm), section_bar(section_number, block.title, styles, regular_font), Spacer(1, 3 * mm)])
    else:
        items.append(Paragraph(f"◆&nbsp; {render_pdf_inline(block.title, regular_font)}", styles["subheading"]))
    index = 0
    while index < len(block.lines):
        stripped = block.lines[index].strip()
        if not stripped:
            index += 1
            continue
        parsed_table = parse_markdown_table(block.lines, index)
        if parsed_table:
            rows, index = parsed_table
            items.extend([content_table(rows, styles, regular_font), Spacer(1, 3 * mm)])
            continue
        callout = CALLOUT_RE.match(stripped)
        if callout:
            content = Paragraph(f"<b>추가 확인 필요</b><br/>{render_pdf_inline(callout.group(1), regular_font)}", styles["callout"])
            table = Table([[content]], colWidths=[CONTENT_WIDTH])
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), PAPER), ("BOX", (0, 0), (-1, -1), 0.8, BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 3 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
            ]))
            items.extend([table, Spacer(1, 3 * mm)])
        elif stripped.startswith(("- ", "* ")):
            items.append(Paragraph(render_pdf_inline(stripped[2:].strip(), regular_font), styles["bullet"], bulletText="●"))
        elif ordered := ORDERED_RE.match(stripped):
            items.append(Paragraph(render_pdf_inline(ordered.group(2), regular_font), styles["ordered"], bulletText=f"{ordered.group(1)}."))
        else:
            items.append(Paragraph(render_pdf_inline(stripped, regular_font), styles["body"]))
        index += 1
    return items
