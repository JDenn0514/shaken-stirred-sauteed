# RapidOCR (PaddleOCR models, free): python3 rapidocr.py photo3.jpg rapid3.txt ...
import sys
from rapidocr_onnxruntime import RapidOCR
eng = RapidOCR()
for src, dst in zip(sys.argv[1::2], sys.argv[2::2]):
    res, _ = eng(src)
    # Lines in reading order: by column (left half first), then top to bottom.
    lines = []
    for box, text, score in (res or []):
        x = min(p[0] for p in box); y = min(p[1] for p in box)
        lines.append((x, y, text))
    open(dst, "w").write("\n".join(t for _, _, t in sorted(lines, key=lambda l: (l[1] // 25, l[0]))))
    print(dst, len(lines), "lines")
