import base64
import os

import fitz  # PyMuPDF


def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def pdf_to_base64_images(base64_pdf):
    try:
        pdf_data = base64.b64decode(base64_pdf)
        with open('/tmp/temp_pdf.pdf', 'wb') as temp_pdf_file:
            temp_pdf_file.write(pdf_data)
        base64_images = []
        temp_image_paths = []

        # Open PDF with PyMuPDF
        doc = fitz.open('/tmp/temp_pdf.pdf')
        total_pages = len(doc)
        print(f'[PDF] Opened PDF with {total_pages} pages')

        if total_pages > 50:
            doc.close()
            print(f'[PDF] Rejecting: {total_pages} pages exceeds limit of 50')
            return False
        print('[PDF] Page count OK')
    except Exception as e:
        print(f'[PDF ERROR] Failed to process PDF: {e}')
        return False

    for page_num in range(total_pages):
        page = doc[page_num]
        # Render page to image (2x zoom for better quality)
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        temp_image_path = f"/tmp/temp_page_{page_num}.png"
        pix.save(temp_image_path)
        temp_image_paths.append(temp_image_path)
        base64_image = encode_image(temp_image_path)
        base64_images.append(base64_image)

    doc.close()
    print('PDF Pages Saved and Encoded')

    for temp_image_path in temp_image_paths:
        os.remove(temp_image_path)

    return base64_images
