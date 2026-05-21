from __future__ import annotations

import argparse
import html
import shutil
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.shared import Cm, Pt
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

from report_common import find_font_file, parse_markdown


def archive_existing(output_dir: Path) -> None:
    archive_dir = output_dir / "archive"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    for suffix in (".docx", ".pdf"):
        current = output_dir / f"meeting{suffix}"
        if not current.exists():
            continue
        archive_dir.mkdir(parents=True, exist_ok=True)
        target = archive_dir / f"meeting_{timestamp}{suffix}"
        counter = 2
        while target.exists():
            target = archive_dir / f"meeting_{timestamp}_{counter}{suffix}"
            counter += 1
        shutil.move(str(current), str(target))


def add_docx_paragraph(document: Document, line: str) -> None:
    stripped = line.strip()
    if not stripped:
        return
    if stripped.startswith(("- ", "* ")):
        document.add_paragraph(stripped[2:].strip(), style="List Bullet")
    elif stripped[0:2].isdigit() and stripped[2:4] in (". ", ") "):
        document.add_paragraph(stripped[4:].strip(), style="List Number")
    else:
        document.add_paragraph(stripped)


def render_docx(markdown: str, output_path: Path) -> None:
    title, blocks = parse_markdown(markdown)
    document = Document()
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = section.page_height, section.page_width
    section.top_margin = Cm(1.4)
    section.bottom_margin = Cm(1.4)
    section.left_margin = Cm(1.7)
    section.right_margin = Cm(1.7)

    styles = document.styles
    styles["Normal"].font.name = "맑은 고딕"
    styles["Normal"].font.size = Pt(10)
    styles["Title"].font.name = "맑은 고딕"
    styles["Title"].font.size = Pt(22)
    for name in ("Heading 1", "Heading 2"):
        styles[name].font.name = "맑은 고딕"

    document.add_heading(title, level=0)
    for block in blocks:
        document.add_heading(block.title, level=min(max(block.level - 1, 1), 2))
        for line in block.lines:
            add_docx_paragraph(document, line)
    document.save(output_path)


def register_pdf_fonts(base_dir: Path) -> tuple[str, str]:
    regular = find_font_file(base_dir, "4Regular")
    bold = find_font_file(base_dir, "8ExtraBold") or find_font_file(base_dir, "6SemiBold")
    if not regular or not bold:
        raise RuntimeError(
            "PDF 한글 폰트를 찾지 못했습니다. fonts/Paperlogy-4Regular.ttf와 "
            "fonts/Paperlogy-8ExtraBold.ttf 또는 fonts/Paperlogy-6SemiBold.ttf가 필요합니다."
        )
    try:
        pdfmetrics.registerFont(TTFont("PaperlogyRegular", str(regular)))
        pdfmetrics.registerFont(TTFont("PaperlogyBold", str(bold)))
    except Exception as exc:
        raise RuntimeError(f"PDF 한글 폰트 등록 실패: {exc}") from exc
    return "PaperlogyRegular", "PaperlogyBold"


def render_pdf(markdown: str, output_path: Path, base_dir: Path) -> None:
    title, blocks = parse_markdown(markdown)
    regular_font, bold_font = register_pdf_fonts(base_dir)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "MeetingTitle",
        parent=styles["Title"],
        fontName=bold_font,
        fontSize=25,
        leading=32,
        textColor=colors.HexColor("#1F3A5F"),
        alignment=TA_LEFT,
        spaceAfter=10,
    )
    heading_style = ParagraphStyle(
        "MeetingHeading",
        parent=styles["Heading2"],
        fontName=bold_font,
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#244766"),
        spaceBefore=8,
        spaceAfter=5,
    )
    body_style = ParagraphStyle(
        "MeetingBody",
        parent=styles["BodyText"],
        fontName=regular_font,
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#24313F"),
        spaceAfter=3,
    )
    bullet_style = ParagraphStyle(
        "MeetingBullet",
        parent=body_style,
        leftIndent=7 * mm,
        firstLineIndent=-4 * mm,
        bulletIndent=1.5 * mm,
    )

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=landscape(A4),
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=13 * mm,
        bottomMargin=17 * mm,
        title=title,
    )

    def draw_footer(canvas, document) -> None:
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#D4E2EA"))
        canvas.setLineWidth(0.4)
        canvas.line(document.leftMargin, 11 * mm, landscape(A4)[0] - document.rightMargin, 11 * mm)
        canvas.setFont(regular_font, 7.5)
        canvas.setFillColor(colors.HexColor("#5B6B73"))
        canvas.drawString(document.leftMargin, 7 * mm, "meeting-harness")
        canvas.drawRightString(landscape(A4)[0] - document.rightMargin, 7 * mm, str(canvas.getPageNumber()))
        canvas.restoreState()

    story = [Paragraph(html.escape(title), title_style), Spacer(1, 5 * mm)]
    for index, block in enumerate(blocks):
        if index and index % 4 == 0:
            story.append(PageBreak())
        story.append(Paragraph(html.escape(block.title), heading_style))
        for line in block.lines:
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith(("- ", "* ")):
                story.append(Paragraph(html.escape(stripped[2:].strip()), bullet_style, bulletText="-"))
                continue
            story.append(Paragraph(html.escape(stripped), body_style))
    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)


def main() -> int:
    parser = argparse.ArgumentParser(description="meeting.md를 DOCX/PDF로 렌더링합니다.")
    parser.add_argument("--input", required=True, help="입력 meeting.md 경로")
    parser.add_argument("--output-dir", required=True, help="출력 디렉터리")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    if not input_path.exists():
        raise SystemExit(f"입력 파일을 찾을 수 없습니다: {input_path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown = input_path.read_text(encoding="utf-8")

    archive_existing(output_dir)
    render_docx(markdown, output_dir / "meeting.docx")
    render_pdf(markdown, output_dir / "meeting.pdf", Path(__file__).resolve().parents[2])
    print(f"DOCX 생성: {output_dir / 'meeting.docx'}")
    print(f"PDF 생성: {output_dir / 'meeting.pdf'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
