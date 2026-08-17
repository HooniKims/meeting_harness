from __future__ import annotations

from pathlib import Path
from typing import Final

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from report_common import find_font_file


PDF_REGULAR_FONT: Final = "PaperlogyRegular"
PDF_BOLD_FONT: Final = "PaperlogyBold"

NAVY: Final = colors.HexColor("#001035")
NAVY_SECONDARY: Final = colors.HexColor("#12285A")
BLUE: Final = colors.HexColor("#3F74C0")
SOFT_BLUE: Final = colors.HexColor("#EAF1FA")
BODY: Final = colors.HexColor("#3A3A3E")
SECONDARY: Final = colors.HexColor("#6B6B70")
LINE: Final = colors.HexColor("#DCDCE0")
PAPER: Final = colors.HexColor("#FAFAFB")
HIGHLIGHT: Final = colors.HexColor("#FFE7A3")

PAGE_SIDE_MARGIN: Final = 14 * mm
PAGE_TOP_MARGIN: Final = 22 * mm
PAGE_BOTTOM_MARGIN: Final = 17 * mm


class PdfFontError(RuntimeError):
    pass


def register_pdf_fonts(base_dir: Path) -> tuple[str, str]:
    regular = find_font_file(base_dir, "4Regular")
    bold = find_font_file(base_dir, "8ExtraBold") or find_font_file(base_dir, "6SemiBold")
    if not regular or not bold:
        raise PdfFontError(
            "PDF 한글 폰트를 찾지 못했습니다. fonts/Paperlogy-4Regular.ttf와 "
            "fonts/Paperlogy-8ExtraBold.ttf 또는 fonts/Paperlogy-6SemiBold.ttf가 필요합니다."
        )
    pdfmetrics.registerFont(TTFont(PDF_REGULAR_FONT, str(regular)))
    pdfmetrics.registerFont(TTFont(PDF_BOLD_FONT, str(bold)))
    pdfmetrics.registerFontFamily(
        PDF_REGULAR_FONT,
        normal=PDF_REGULAR_FONT,
        bold=PDF_BOLD_FONT,
        italic=PDF_REGULAR_FONT,
        boldItalic=PDF_BOLD_FONT,
    )
    return PDF_REGULAR_FONT, PDF_BOLD_FONT


def build_pdf_styles(regular_font: str, bold_font: str) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body = ParagraphStyle(
        "MeetingBody",
        parent=base["BodyText"],
        fontName=regular_font,
        fontSize=9.5,
        leading=15,
        textColor=BODY,
        spaceAfter=3.5 * mm,
        splitLongWords=False,
    )
    return {
        "kicker": ParagraphStyle(
            "MeetingKicker", parent=body, fontName=bold_font, fontSize=7.5,
            leading=10, textColor=BLUE, spaceAfter=2.5 * mm,
        ),
        "title": ParagraphStyle(
            "MeetingTitle", parent=base["Title"], fontName=bold_font, fontSize=27,
            leading=34, textColor=NAVY, alignment=TA_LEFT, spaceAfter=7 * mm,
        ),
        "card_label": ParagraphStyle(
            "CardLabel", parent=body, fontName=bold_font, fontSize=7.3,
            leading=9, textColor=BLUE, spaceAfter=1.2 * mm,
        ),
        "card_value": ParagraphStyle(
            "CardValue", parent=body, fontName=regular_font, fontSize=9.3,
            leading=14, textColor=NAVY_SECONDARY, spaceAfter=0,
        ),
        "summary_label": ParagraphStyle(
            "SummaryLabel", parent=body, fontName=bold_font, fontSize=8,
            leading=10, textColor=BLUE, spaceAfter=2 * mm,
        ),
        "summary": ParagraphStyle(
            "Summary", parent=body, fontName=regular_font, fontSize=10,
            leading=16, textColor=BODY, spaceAfter=0,
        ),
        "section_number": ParagraphStyle(
            "SectionNumber", parent=body, fontName=bold_font, fontSize=12,
            leading=16, textColor=colors.white, alignment=TA_LEFT, spaceAfter=0,
        ),
        "section": ParagraphStyle(
            "Section", parent=body, fontName=bold_font, fontSize=13,
            leading=17, textColor=NAVY, spaceAfter=0,
        ),
        "subheading": ParagraphStyle(
            "Subheading", parent=body, fontName=bold_font, fontSize=10.5,
            leading=15, textColor=NAVY_SECONDARY, spaceBefore=1.5 * mm,
            spaceAfter=2.5 * mm, keepWithNext=True,
        ),
        "body": body,
        "bullet": ParagraphStyle(
            "MeetingBullet", parent=body, leftIndent=6 * mm,
            firstLineIndent=-4 * mm, bulletIndent=1.2 * mm, spaceAfter=1.8 * mm,
        ),
        "ordered": ParagraphStyle(
            "MeetingOrdered", parent=body, leftIndent=7 * mm,
            firstLineIndent=-5 * mm, bulletIndent=0, bulletFontName=bold_font,
            bulletFontSize=9.5, spaceAfter=1.8 * mm,
        ),
        "table_head": ParagraphStyle(
            "TableHead", parent=body, fontName=bold_font, fontSize=8,
            leading=11, textColor=colors.white, spaceAfter=0,
        ),
        "table_body": ParagraphStyle(
            "TableBody", parent=body, fontSize=8.2, leading=12,
            textColor=BODY, spaceAfter=0,
        ),
        "callout": ParagraphStyle(
            "Callout", parent=body, fontSize=8.8, leading=13,
            textColor=NAVY_SECONDARY, spaceAfter=0,
        ),
    }
