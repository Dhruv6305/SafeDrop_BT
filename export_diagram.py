import shutil
from PIL import Image

src = r"C:\Users\Dhruv\.gemini\antigravity-ide\brain\5bca42fc-f80c-4bef-873e-c23d0f35d540\safedrop_architecture_diagram_1791800733943.jpg"
dst_png = r"c:\Users\Dhruv\Downloads\SafeDrop\SafeDrop\architecture_diagram.png"
dst_jpg = r"c:\Users\Dhruv\Downloads\SafeDrop\SafeDrop\architecture_diagram.jpg"

try:
    img = Image.open(src)
    img.save(dst_png, "PNG")
    img.save(dst_jpg, "JPEG")
    print(f"Saved PNG to {dst_png}")
except Exception as e:
    # Fallback to copy
    shutil.copyfile(src, dst_png)
    shutil.copyfile(src, dst_jpg)
    print(f"Copied to {dst_png}")
