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
    """AI-powered PDF splitter using GPT-4o for TOC parsing (structure only)."""

    def __init__(self, model_name: str = "gemini-2.5-flash", max_toc_pages: int = 20):
        self.model_name = model_name
        self.max_toc_pages = max_toc_pages

        self.llm = ChatGoogleGenerativeAI(
            model = model_name
        )

    # -------------------------------------------------
    # UTILS
    # -------------------------------------------------

    @staticmethod
    def safe_filename(text: str, max_len: int = 70) -> str:
        return re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_")[:max_len]

    # -------------------------------------------------
    # STEP 2: EXTRACT PRINTED TOC TEXT
    # -------------------------------------------------

    def extract_printed_toc_text(self, pdf_path: str) -> str:
        doc = fitz.open(pdf_path)
        toc_text = ""

        for i in range(min(self.max_toc_pages, len(doc))):
            page_text = doc[i].get_text()
            toc_text += "\n" + page_text

        doc.close()

        if not toc_text.strip():
            raise RuntimeError("Printed TOC not found in PDF.")

        return toc_text

    # -------------------------------------------------
    # STEP 3: Gemini 2.5 — PARSE TOC
    # -------------------------------------------------

    def ai_parse_toc(self, toc_text: str) -> List[Dict[str, int]]:
        prompt = f"""
        You are given the PRINTED TABLE OF CONTENTS (TOC) of a large RFP / policy document.

        Your task is to extract ONLY the MAIN SECTIONS and compute their CORRECT START PAGE NUMBERS
        so the document can be split accurately.

        ====================
        WHAT TO EXTRACT
        ====================
        Extract ONLY these as sections:
        1. Chapters (e.g. Chapter I, Chapter II, Chapter III, etc.)
        2. Annexures / Appendices

        Rules:
        - IGNORE all sub-sections such as:
        - 1.1, 1.2, 2.3
        - bullets, clauses, sub-headings
        - If MULTIPLE Annexures / Appendices are listed,
        COMBINE them into ONE section titled exactly:
        "ANNEXURES"


        ====================
        TOC TEXT
        ====================
        {toc_text}

        \n
        
        
        ====================
        **PAGE NUMBER ADJUSTMENT LOGIC (Very Very Important)**
        ====================
        The TOC page numbers may NOT match the actual PDF page indices.

        Definitions:
        - A = number of actual PDF pages BEFORE the CONTENTS page
        - B = printed page number shown on the page immediately BEFORE the CONTENTS page
        - PAGE_OFFSET = B - A

        For every section:
        ADJUSTED_PAGE = TOC_PAGE_NUMBER - PAGE_OFFSET

        Rules:
        - Always return the ADJUSTED_PAGE value
        - Page numbers are 1-based
        - Do NOT return zero or negative numbers

        ====================
        OUTPUT FORMAT (STRICT)
        ====================
        Return ONLY a valid JSON ARRAY.
        Do NOT include explanations, comments, or markdown.

        Each item MUST look exactly like this:
        {{
        "title": "<SECTION TITLE>",
        "page": <ADJUSTED_START_PAGE_NUMBER>
        }}

        ====================
        EXAMPLE OUTPUT
        ====================
        [
        {{ "title": "Chapter I - .....", "page": 44 }},
        {{ "title": "Chapter II - .....", "page": 64 }},
        {{ "title": "Chapter III - .....", "page": 88 }},
        {{ "title": "Chapter IV - ......", "page": 105 }},
        {{ "title": "ANNEXURES", "page": 125 }}
        ]
    """

        response = self.llm.invoke([HumanMessage(content=prompt)])

        import re

        pattern = r'```json\s*(.*?)\s*```'
        json_match = re.search(pattern, response.content, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        return json.loads(json_str)


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
        toc_text = self.extract_printed_toc_text(pdf_path)

        raw_sections = self.ai_parse_toc(toc_text)

        if len(raw_sections) < 2:
            raise RuntimeError("AI could not detect enough sections from TOC.")

        output_files = self.split_pdf_by_sections(pdf_path, raw_sections, output_dir)

        return {
            "sections": raw_sections,
            "output_files": output_files,
            "total_sections": len(raw_sections)
        }
