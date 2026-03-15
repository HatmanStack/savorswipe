import base64
import os

import fitz  # PyMuPDF

from config import PDF_MAX_PAGES
from logger import StructuredLogger

log = StructuredLogger("pdf")


def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def pdf_to_base64_images(base64_pdf):
    temp_pdf_path = '/tmp/temp_pdf.pdf'
    temp_image_paths = []
    doc = None

    try:
        pdf_data = base64.b64decode(base64_pdf)
        with open(temp_pdf_path, 'wb') as temp_pdf_file:
            temp_pdf_file.write(pdf_data)

        # Open PDF with PyMuPDF
        doc = fitz.open(temp_pdf_path)
        total_pages = len(doc)
        log.info("Opened PDF", total_pages=total_pages)

        if total_pages > PDF_MAX_PAGES:
            log.info("PDF exceeds page limit, processing in chunks", total_pages=total_pages, limit=PDF_MAX_PAGES, chunk_size=PDF_MAX_PAGES)

        base64_images = []
        for page_num in range(total_pages):
            if total_pages > PDF_MAX_PAGES and page_num % PDF_MAX_PAGES == 0:
                chunk_idx = page_num // PDF_MAX_PAGES
                chunk_end = min(page_num + PDF_MAX_PAGES, total_pages)
                log.info("Processing chunk", chunk=chunk_idx + 1, pages=f"{page_num + 1}-{chunk_end}", total_pages=total_pages)
            page = doc[page_num]
            # Render page to image (2x zoom for better quality)
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            temp_image_path = f"/tmp/temp_page_{page_num}.png"
            pix.save(temp_image_path)
            temp_image_paths.append(temp_image_path)
            base64_image = encode_image(temp_image_path)
            base64_images.append(base64_image)

        log.info("PDF pages saved and encoded", total_pages=total_pages)
        return base64_images

    except Exception as e:
        log.error("Failed to process PDF", error=str(e))
        return False

    finally:
        # Always close document and clean up temp files
        if doc:
            doc.close()
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
        for path in temp_image_paths:
            if os.path.exists(path):
                os.remove(path)
