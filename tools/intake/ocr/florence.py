# Florence-2 OCR on a photo, read in overlapping tiles (the model works at 768x768).
#   python3 florence.py microsoft/Florence-2-base 2000 1700 photo3.jpg ...   (BEAMS=1 TAG=-fast for the fast settings)
# Needs: torch, torchvision (a matching pair), transformers==4.46.3, timm, einops.
import sys, time
from unittest.mock import patch
from PIL import Image
import torch
from transformers import AutoModelForCausalLM, AutoProcessor
from transformers.dynamic_module_utils import get_imports

MODEL = sys.argv[1]
def no_flash(filename):
    imports = get_imports(filename)
    return [i for i in imports if i != "flash_attn"]
with patch("transformers.dynamic_module_utils.get_imports", no_flash):
    model = AutoModelForCausalLM.from_pretrained(MODEL, trust_remote_code=True, attn_implementation="eager", torch_dtype=torch.float32).eval()
proc = AutoProcessor.from_pretrained(MODEL, trust_remote_code=True)
torch.set_num_threads(4)

def ocr(img):
    inputs = proc(text="<OCR>", images=img, return_tensors="pt")
    with torch.no_grad():
        ids = model.generate(input_ids=inputs["input_ids"], pixel_values=inputs["pixel_values"], max_new_tokens=1024, num_beams=int(__import__("os").environ.get("BEAMS", "3")), do_sample=False)
    return proc.batch_decode(ids, skip_special_tokens=True)[0]

TILE, STEP = int(sys.argv[2]), int(sys.argv[3])
for src in sys.argv[4:]:
    im = Image.open(src).convert("RGB")
    W, H = im.size
    xs = list(range(0, max(1, W - TILE), STEP)) + [max(0, W - TILE)]
    ys = list(range(0, max(1, H - TILE), STEP)) + [max(0, H - TILE)]
    out, t0 = [], time.time()
    for y in sorted(set(ys)):
        for x in sorted(set(xs)):
            out.append(f"[tile {x},{y}] " + ocr(im.crop((x, y, min(W, x + TILE), min(H, y + TILE)))))
    dst = src.rsplit(".", 1)[0] + "." + MODEL.split("/")[-1] + __import__("os").environ.get("TAG", "") + ".txt"
    open(dst, "w").write("\n".join(out))
    print(f"{src}: {len(out)} tiles in {time.time() - t0:.0f} s -> {dst}", flush=True)
