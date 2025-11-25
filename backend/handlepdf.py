import base64
import os

from pdf2image import convert_from_path


def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def pdf_to_base64_images(base64_pdf):
    pdf_data = base64.b64decode(base64_pdf)
    with open('/tmp/temp_pdf.pdf', 'wb') as temp_pdf_file:
        temp_pdf_file.write(pdf_data)
    base64_images = []
    temp_image_paths = []
    images = convert_from_path('/tmp/temp_pdf.pdf')

    total_pages = len(images)
    if total_pages > 3:
        return False
    print('Total pages Counted')

    for page_num, img in enumerate(images):
        temp_image_path = f"/tmp/temp_page_{page_num}.png"
        img.save(temp_image_path, format="JPG")
        temp_image_paths.append(temp_image_path)
        base64_image = encode_image(temp_image_path)
        base64_images.append(base64_image)

    print('PDF Pages Saved and Encoded')
    for temp_image_path in temp_image_paths:
        os.remove(temp_image_path)

    return base64_images
