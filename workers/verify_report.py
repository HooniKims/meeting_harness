from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from docx import Document

from report_common import REQUIRED_SECTIONS, parse_markdown, section_map


@dataclass
class Verification:
    passed: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    needs_review: list[str] = field(default_factory=list)

    def pass_(self, message: str) -> None:
        self.passed.append(message)

    def fail(self, message: str) -> None:
        self.failed.append(message)

    def review(self, message: str) -> None:
        self.needs_review.append(message)


def extract_pdf_text(pdf_path: Path) -> tuple[int, str]:
    try:
        import fitz

        with fitz.open(pdf_path) as doc:
            text = "\n".join(page.get_text() for page in doc)
            return doc.page_count, text
    except ImportError:
        pass

    try:
        from pypdf import PdfReader

        reader = PdfReader(str(pdf_path))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        return len(reader.pages), text
    except ImportError as exc:
        raise RuntimeError("PyMuPDF(fitz) 또는 pypdf가 필요합니다.") from exc


def extract_pdf_fonts(pdf_path: Path) -> set[str]:
    try:
        import fitz
    except ImportError:
        return set()

    fonts: set[str] = set()
    with fitz.open(pdf_path) as doc:
        for page in doc:
            for font in page.get_fonts(full=True):
                if len(font) >= 4 and font[3]:
                    fonts.add(str(font[3]))
    return fonts


def check_required_files(workdir: Path, result: Verification) -> None:
    required = [
        "output/meeting.md",
        "output/meeting.docx",
        "output/meeting.pdf",
        "work/transcript.txt",
        "work/transcript.json",
        "config/meeting_info.json",
        "README_결과물.md",
    ]
    for relative in required:
        path = workdir / relative
        if path.exists() and path.stat().st_size > 0:
            result.pass_(f"{relative} 존재 확인")
        else:
            result.fail(f"{relative} 파일이 없거나 비어 있습니다.")


def check_markdown(workdir: Path, result: Verification) -> None:
    path = workdir / "output" / "meeting.md"
    if not path.exists():
        return
    markdown = path.read_text(encoding="utf-8")
    _, blocks = parse_markdown(markdown)
    sections = section_map(blocks)
    for section in REQUIRED_SECTIONS:
        block = sections.get(section)
        if block is None:
            result.fail(f"meeting.md 필수 섹션 누락: {section}")
        elif block.text:
            result.pass_(f"meeting.md 섹션 내용 확인: {section}")
        else:
            result.fail(f"meeting.md 필수 섹션이 비어 있습니다: {section}")
    if "추가 확인 필요" in markdown:
        result.review("meeting.md에 '추가 확인 필요' 문구가 남아 있습니다.")


def check_docx(workdir: Path, result: Verification) -> None:
    path = workdir / "output" / "meeting.docx"
    if not path.exists() or path.stat().st_size == 0:
        return
    try:
        document = Document(path)
        text = "\n".join(p.text for p in document.paragraphs).strip()
    except Exception as exc:
        result.fail(f"DOCX 열기 실패: {exc}")
        return
    if text:
        result.pass_("DOCX 열림 및 텍스트 추출 확인")
    else:
        result.fail("DOCX 텍스트 추출 결과가 비어 있습니다.")


def check_pdf(workdir: Path, result: Verification) -> None:
    path = workdir / "output" / "meeting.pdf"
    if not path.exists() or path.stat().st_size == 0:
        return
    try:
        page_count, text = extract_pdf_text(path)
    except Exception as exc:
        result.fail(f"PDF 열기 실패: {exc}")
        return
    if page_count >= 1:
        result.pass_(f"PDF 페이지 수 확인: {page_count}쪽")
    else:
        result.fail("PDF 페이지 수가 1쪽 미만입니다.")
    if text.strip():
        result.pass_("PDF 텍스트 추출 확인")
    else:
        result.fail("PDF 텍스트 추출 결과가 비어 있습니다.")
    if "■" in text or "□" in text:
        result.fail("PDF에 글자 대체 박스(■/□)가 포함되어 있습니다. 한글 폰트 임베딩을 확인하세요.")
    fonts = extract_pdf_fonts(path)
    if fonts and any("Paperlogy" in font for font in fonts):
        result.pass_("PDF Paperlogy 폰트 임베딩 확인")
    elif fonts:
        result.fail(f"PDF에 Paperlogy 폰트가 임베딩되지 않았습니다: {', '.join(sorted(fonts)[:8])}")
    else:
        result.review("PDF 폰트 목록을 확인하지 못했습니다. PyMuPDF 설치 상태를 확인하세요.")


def write_report(workdir: Path, result: Verification) -> Path:
    output_dir = workdir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    if result.failed:
        status = "실패"
    elif result.needs_review:
        status = "확인 필요"
    else:
        status = "통과"

    def lines(items: list[str], empty: str) -> list[str]:
        return [f"- {item}" for item in items] if items else [f"- {empty}"]

    content = [
        "# 생성 결과 검증 보고서",
        "## 전체 결과",
        f"- 상태: {status}",
        f"- 검증 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 작업 폴더: {workdir}",
        "",
        "## 통과",
        *lines(result.passed, "통과 항목 없음"),
        "",
        "## 실패",
        *lines(result.failed, "실패 항목 없음"),
        "",
        "## 확인 필요",
        *lines(result.needs_review, "확인 필요 항목 없음"),
        "",
        "## 다음 조치",
    ]
    if result.failed:
        content.extend(
            [
                "- output/meeting.md와 생성된 DOCX/PDF를 확인한 뒤 렌더를 다시 실행하세요.",
                "- 수정 후 verify_report.py를 다시 실행하세요.",
            ]
        )
    elif result.needs_review:
        content.append("- 확인 필요 항목을 검토한 뒤 필요하면 meeting.md를 보완하세요.")
    else:
        content.append("- 제출 및 공유 가능한 상태입니다.")

    path = output_dir / "verification_report.md"
    path.write_text("\n".join(content) + "\n", encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="meeting-harness 산출물을 검증합니다.")
    parser.add_argument("--workdir", required=True, help="작업 폴더")
    parser.add_argument("--strict", action="store_true", help="실패 항목이 있으면 exit 1")
    args = parser.parse_args()

    workdir = Path(args.workdir).resolve()
    result = Verification()
    check_required_files(workdir, result)
    check_markdown(workdir, result)
    check_docx(workdir, result)
    check_pdf(workdir, result)
    report_path = write_report(workdir, result)
    print(f"검증 보고서 생성: {report_path}")
    if args.strict and result.failed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
