import os
import re
import json
from typing import List, Dict

import fitz  # PyMuPDF
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()


class PDFSplitter:
    """
    Enterprise-grade PDF splitter:
    - AI parses TOC structure only
    - Python handles ALL page math
    - Auto-corrects page offset dynamically
    """

    def __init__(self, model_name: str = "gemini-2.5-flash", max_toc_pages: int = 20):
        self.model_name = model_name
        self.max_toc_pages = max_toc_pages

        self.llm = ChatGoogleGenerativeAI(
            model=model_name,
            temperature=0
        )

    # -------------------------------------------------
    # UTILS
    # -------------------------------------------------

    @staticmethod
    def safe_filename(text: str, max_len: int = 70) -> str:
        return re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_")[:max_len]

    # -------------------------------------------------
    # STEP 1: INITIAL PAGE OFFSET (BEST GUESS)
    # -------------------------------------------------

    def compute_initial_page_offset(self, pdf_path: str) -> int:
        """
        PAGE_OFFSET = printed_page_before_contents - actual_pages_before_contents
        """
        doc = fitz.open(pdf_path)
        contents_page_index = None

        for i in range(min(self.max_toc_pages, len(doc))):
            if "CONTENTS" in doc[i].get_text().upper():
                contents_page_index = i
                break

        if contents_page_index is None or contents_page_index == 0:
            raise RuntimeError("CONTENTS page not found or invalid.")

        prev_page_text = doc[contents_page_index - 1].get_text()
        numbers = re.findall(r"\b(\d+)\b", prev_page_text)

        if not numbers:
            raise RuntimeError("Printed page number not found before CONTENTS.")

        printed_page_before_contents = int(numbers[-1])
        actual_pages_before_contents = contents_page_index

        doc.close()
        return printed_page_before_contents - actual_pages_before_contents

    # -------------------------------------------------
    # STEP 2: EXTRACT PRINTED TOC TEXT
    # -------------------------------------------------

    def extract_printed_toc_text(self, pdf_path: str) -> str:
        doc = fitz.open(pdf_path)
        toc_text = ""
        toc_started = False

        for i in range(min(self.max_toc_pages, len(doc))):
            page_text = doc[i].get_text()

            if "CONTENTS" in page_text.upper():
                toc_started = True

            if toc_started:
                toc_text += "\n" + page_text

                # Stop once actual content starts
                if re.search(r"CHAPTER\s+[IVXLC]+", page_text, re.IGNORECASE):
                    break

        doc.close()

        if not toc_text.strip():
            raise RuntimeError("Printed TOC not found.")

        return toc_text

    # -------------------------------------------------
    # STEP 3: AI — PARSE TOC (STRUCTURE ONLY)
    # -------------------------------------------------

    def ai_parse_toc(self, toc_text: str) -> List[Dict[str, int]]:
        """
        Gemini extracts ONLY:
        - section titles
        - RAW TOC page numbers
        """

        prompt = f"""
            You are a STRICT document-structure parser.

            TASK:
            From the PRINTED TABLE OF CONTENTS below, extract ONLY MAIN SECTIONS.

            RULES:
            - Extract ONLY:
            1. Chapters (Chapter I, II, III, etc.)
            2. Annexures / Appendices
            - IGNORE sub-sections (1.1, 2.3, bullets, clauses)
            - If MULTIPLE Annexures / Appendices exist,
            COMBINE them into ONE section titled EXACTLY:
            "ANNEXURES"
            - Preserve original order
            - Do NOT invent sections

            OUTPUT FORMAT (STRICT):
            Return ONLY valid JSON array.
            No markdown. No explanations.

            Each item MUST look like:
            {{
            "title": "<SECTION TITLE>",
            "page": <RAW_TOC_PAGE_NUMBER>
            }}

            TOC TEXT:
            {toc_text}
        """

        response = self.llm.invoke([HumanMessage(content=prompt)])
        raw = response.content.strip()

        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            raise RuntimeError(f"Invalid JSON returned by Gemini:\n{raw[:500]}")

        return json.loads(match.group(0))

    # -------------------------------------------------
    # STEP 4: FIND ACTUAL CHAPTER-I PAGE (GROUND TRUTH)
    # -------------------------------------------------

    def detect_actual_chapter_start(self, pdf_path: str, chapter_title: str) -> int:
        """
        Finds the actual page where Chapter I starts,
        explicitly skipping TOC pages.
        Returns 1-based page number.
        """
        doc = fitz.open(pdf_path)

        contents_page_index = None

        # Step 1: Find CONTENTS page
        for i in range(min(self.max_toc_pages, len(doc))):
            if "CONTENTS" in doc[i].get_text().upper():
                contents_page_index = i
                break

        if contents_page_index is None:
            raise RuntimeError("CONTENTS page not found.")

        # Step 2: Prepare strict Chapter-I matcher
        chapter_key = chapter_title.split("-")[0].strip()   # "Chapter I"
        pattern = re.compile(rf"\b{re.escape(chapter_key)}\b", re.IGNORECASE)

        # Step 3: Search ONLY AFTER contents page
        for i in range(contents_page_index + 1, len(doc)):
            text = doc[i].get_text()

            # Skip pages that still look like TOC spillover
            if "CONTENTS" in text.upper():
                continue

            if pattern.search(text):
                doc.close()
                return i + 1  # 1-based page number

        doc.close()
        raise RuntimeError("Could not locate actual Chapter I start page.")

    # -------------------------------------------------
    # STEP 5: AUTO-CORRECT PAGE OFFSET
    # -------------------------------------------------

    def compute_corrected_page_offset(
        self,
        pdf_path: str,
        raw_sections: List[Dict[str, int]]
    ) -> int:
        """
        Corrects offset by validating against real Chapter-I page
        """
        initial_offset = self.compute_initial_page_offset(pdf_path)

        first_section = raw_sections[0]
        actual_start = self.detect_actual_chapter_start(
            pdf_path, first_section["title"]
        )

        expected_start = first_section["page"] - initial_offset
        correction = expected_start - actual_start

        return initial_offset + correction

    # -------------------------------------------------
    # STEP 6: APPLY OFFSET
    # -------------------------------------------------

    @staticmethod
    def apply_page_offset(sections: List[Dict[str, int]], offset: int):
        adjusted = []
        for sec in sections:
            page = sec["page"] - offset
            adjusted.append({
                "title": sec["title"],
                "page": max(page, 1)
            })
        return adjusted

    # -------------------------------------------------
    # STEP 7: SPLIT PDF (FORMAT PRESERVED)
    # -------------------------------------------------

    def split_pdf_by_sections(
        self,
        pdf_path: str,
        sections: List[Dict[str, int]],
        output_dir: str
    ) -> List[Dict[str, str]]:

        os.makedirs(output_dir, exist_ok=True)
        doc = fitz.open(pdf_path)
        output_files = []

        for i, sec in enumerate(sections):
            start_page = sec["page"] - 1
            end_page = (
                sections[i + 1]["page"] - 2
                if i + 1 < len(sections)
                else len(doc) - 1
            )

            out = fitz.open()
            out.insert_pdf(doc, from_page=start_page, to_page=end_page)

            filename = self.safe_filename(sec["title"]) or f"SECTION_{i+1}"
            full_filename = f"{filename}.pdf"
            path = os.path.join(output_dir, full_filename)
            out.save(path)
            out.close()

            output_files.append({
                "title": sec["title"],
                "filename": full_filename,
                "start_page": sec["page"],
                "end_page": sections[i + 1]["page"] - 1 if i + 1 < len(sections) else len(doc),
                "path": path
            })

        doc.close()
        return output_files

    # -------------------------------------------------
    # MAIN ENTRY POINT
    # -------------------------------------------------

    def split_pdf(self, pdf_path: str, output_dir: str) -> Dict:
        toc_text = self.extract_printed_toc_text(pdf_path)
        raw_sections = self.ai_parse_toc(toc_text)

        if len(raw_sections) < 2:
            raise RuntimeError("Not enough sections detected.")

        corrected_offset = self.compute_corrected_page_offset(
            pdf_path, raw_sections
        )

        sections = self.apply_page_offset(raw_sections, corrected_offset)
        outputs = self.split_pdf_by_sections(pdf_path, sections, output_dir)

        return {
            "page_offset": corrected_offset,
            "sections": sections,
            "output_files": outputs,
            "total_sections": len(sections)
        }
