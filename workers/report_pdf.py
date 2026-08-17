from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer

from report_common import MarkdownBlock, parse_markdown, parse_meeting_metadata, section_map
from report_pdf_flowables import block_flowables, info_card, render_pdf_inline, summary_card
from report_theme import (
    HIGHLIGHT,
    LINE,
    NAVY,
    PAGE_BOTTOM_MARGIN,
    PAGE_SIDE_MARGIN,
    PAGE_TOP_MARGIN,
    SECONDARY,
    build_pdf_styles,
    register_pdf_fonts,
)


def _draw_page_chrome(
    page_canvas: canvas.Canvas,
    title: str,
    current: int,
    total: int,
    regular_font: str,
    bold_font: str,
) -> None:
    page_canvas.saveState()
    header_title = title if len(title) <= 34 else f"{title[:33]}…"
    page_canvas.setFont(bold_font, 7.5)
    page_canvas.setFillColor(NAVY)
    page_canvas.drawString(PAGE_SIDE_MARGIN, A4[1] - 11 * mm, f"{header_title} · 회의록")
    page_canvas.setFont(regular_font, 7.5)
    page_canvas.setFillColor(SECONDARY)
    page_canvas.drawRightString(
        A4[0] - PAGE_SIDE_MARGIN, A4[1] - 11 * mm, f"{current:02d} / {total:02d}"
    )
    page_canvas.setStrokeColor(LINE)
    page_canvas.setLineWidth(0.5)
    page_canvas.line(PAGE_SIDE_MARGIN, A4[1] - 14 * mm, A4[0] - PAGE_SIDE_MARGIN, A4[1] - 14 * mm)
    page_canvas.line(PAGE_SIDE_MARGIN, 11 * mm, A4[0] - PAGE_SIDE_MARGIN, 11 * mm)
    page_canvas.setFont(regular_font, 7)
    page_canvas.drawString(PAGE_SIDE_MARGIN, 7 * mm, "MEETING HARNESS")
    page_canvas.drawRightString(
        A4[0] - PAGE_SIDE_MARGIN, 7 * mm, f"GENERATED {datetime.now():%Y.%m.%d}"
    )
    page_canvas.restoreState()


def render_pdf(markdown: str, output_path: Path, base_dir: Path) -> None:
    title, blocks = parse_markdown(markdown)
    sections = section_map(blocks)
    regular_font, bold_font = register_pdf_fonts(base_dir)
    styles = build_pdf_styles(regular_font, bold_font)
    metadata = parse_meeting_metadata(sections.get("회의 개요", MarkdownBlock(2, "", [])).lines)
    summary_lines = sections.get("전체 요약", MarkdownBlock(2, "", [])).lines

    def make_document(target) -> SimpleDocTemplate:
        return SimpleDocTemplate(
            target, pagesize=A4, rightMargin=PAGE_SIDE_MARGIN, leftMargin=PAGE_SIDE_MARGIN,
            topMargin=PAGE_TOP_MARGIN, bottomMargin=PAGE_BOTTOM_MARGIN, title=title,
        )

    def make_story():
        story = [
            Paragraph("PROJECT MEETING RECORD", styles["kicker"]),
            Paragraph(f'<font backColor="{HIGHLIGHT.hexval()}">{render_pdf_inline(title, regular_font)}</font>', styles["title"]),
        ]
        meeting_info = info_card(metadata, styles, regular_font)
        if meeting_info:
            story.extend([meeting_info, Spacer(1, 5 * mm)])
        meeting_summary = summary_card(summary_lines, styles, regular_font)
        if meeting_summary:
            story.extend([meeting_summary, Spacer(1, 5 * mm)])

        section_number = 0
        section_items = []
        for block in blocks:
            if block.title.strip() in {"회의 개요", "전체 요약"}:
                continue
            if block.level == 2:
                if section_items:
                    story.append(KeepTogether(section_items))
                section_number += 1
                section_items = block_flowables(block, section_number, styles, regular_font)
            else:
                section_items.extend(block_flowables(block, section_number, styles, regular_font))
        if section_items:
            story.append(KeepTogether(section_items))
        return story

    page_count = [0]

    class CountingCanvas(canvas.Canvas):
        def showPage(self) -> None:
            page_count[0] += 1
            super().showPage()

    make_document(io.BytesIO()).build(make_story(), canvasmaker=CountingCanvas)

    def draw_chrome(page_canvas: canvas.Canvas, _) -> None:
        _draw_page_chrome(
            page_canvas, title, page_canvas.getPageNumber(), page_count[0], regular_font, bold_font
        )

    make_document(str(output_path)).build(
        make_story(), onFirstPage=draw_chrome, onLaterPages=draw_chrome
    )
