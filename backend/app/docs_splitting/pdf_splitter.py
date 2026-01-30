import os
import re
import json
from typing import List, Dict

import fitz  # PyMuPDF
from langchain_openai import AzureChatOpenAI
from langchain.messages import HumanMessage


class PDFSplitter:
    """AI-powered PDF splitter using GPT-4o for TOC parsing (structure only)."""

    def __init__(self, model_name: str = "gpt-4o", max_toc_pages: int = 20):
        self.model_name = model_name
        self.max_toc_pages = max_toc_pages

        self.llm = AzureChatOpenAI(
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version="2024-02-15-preview",
            deployment_name=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", model_name),
            temperature=0
        )

    # -------------------------------------------------
    # UTILS
    # -------------------------------------------------

    @staticmethod
    def safe_filename(text: str, max_len: int = 70) -> str:
        return re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_")[:max_len]

    # -------------------------------------------------
    # STEP 1: FIND CONTENTS PAGE + COMPUTE PAGE OFFSET
    # -------------------------------------------------

    def compute_page_offset(self, pdf_path: str) -> int:
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

                # Stop once chapters start
                if re.search(r"CHAPTER\s+[IVXLC]+", page_text, re.IGNORECASE):
                    break

        doc.close()

        if not toc_text.strip():
            raise RuntimeError("Printed TOC not found.")

        return toc_text

    # -------------------------------------------------
    # STEP 3: GPT-4o — PARSE TOC (NO OFFSET MATH)
    # -------------------------------------------------

    def ai_parse_toc(self, toc_text: str) -> List[Dict[str, int]]:
        """
        GPT-4o extracts ONLY titles + RAW TOC page numbers.
        """

        prompt = f"""
SYSTEM INSTRUCTION:
You are a STRICT document-structure parser.
Return ONLY valid JSON. No markdown. No explanations.

TASK:
From the printed TABLE OF CONTENTS below, extract ONLY MAIN SECTIONS.

RULES:
- Extract ONLY:
  1. Chapters (Chapter I, II, III, etc.)
  2. Annexures / Appendices
- IGNORE sub-sections (1.1, 2.3, bullets, clauses)
- If MULTIPLE Annexures / Appendices exist,
  COMBINE them into ONE section titled EXACTLY: "ANNEXURES"
- Preserve original order
- Do NOT invent sections

OUTPUT FORMAT (STRICT):
Return a JSON ARRAY like:
[
  {{ "title": "Chapter I - Broad Scope of Work", "page": 24 }},
  {{ "title": "Chapter II - Instructions to Bidders", "page": 74 }},
  {{ "title": "ANNEXURES", "page": 125 }}
]

TOC TEXT:
{toc_text}
"""

        response = self.llm.invoke([HumanMessage(content=prompt)])
        raw = response.content.strip()

        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            raise ValueError("GPT-4o did not return valid JSON.")

        return json.loads(match.group(0))

    # -------------------------------------------------
    # STEP 4: APPLY PAGE OFFSET (DETERMINISTIC)
    # -------------------------------------------------

    @staticmethod
    def apply_page_offset(sections: List[Dict[str, int]], page_offset: int):
        adjusted = []
        for sec in sections:
            page = sec["page"] - page_offset
            adjusted.append({
                "title": sec["title"],
                "page": max(page, 1)
            })
        return adjusted

    # -------------------------------------------------
    # STEP 5: SPLIT PDF (FORMAT PRESERVED)
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
            output_path = os.path.join(output_dir, f"{filename}.pdf")
            out.save(output_path)
            out.close()

            output_files.append({
                "title": sec["title"],
                "filename": f"{filename}.pdf",
                "start_page": sec["page"],
                "end_page": sections[i + 1]["page"] - 1 if i + 1 < len(sections) else len(doc),
                "path": output_path
            })

        doc.close()
        return output_files

    # -------------------------------------------------
    # MAIN ENTRY POINT
    # -------------------------------------------------

    def split_pdf(self, pdf_path: str, output_dir: str) -> Dict:
        page_offset = self.compute_page_offset(pdf_path)
        toc_text = self.extract_printed_toc_text(pdf_path)

        raw_sections = self.ai_parse_toc(toc_text)

        if len(raw_sections) < 2:
            raise RuntimeError("AI could not detect enough sections from TOC.")

        sections = self.apply_page_offset(raw_sections, page_offset)
        output_files = self.split_pdf_by_sections(pdf_path, sections, output_dir)

        return {
            "page_offset": page_offset,
            "sections": sections,
            "output_files": output_files,
            "total_sections": len(sections)
        }
