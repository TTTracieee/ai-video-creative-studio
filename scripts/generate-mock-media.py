"""Generate original, watermarked demo clips. FFmpeg is needed only to rebuild assets."""
import pathlib
import subprocess

destination = pathlib.Path(__file__).resolve().parent.parent / "public" / "mock"
destination.mkdir(parents=True, exist_ok=True)
for name, width, height in [("portrait", 360, 640), ("landscape", 640, 360), ("square", 480, 480)]:
    filters = (
        "drawbox=x=0:y=ih*0.7:w=iw:h=ih*0.3:color=0x71684f:t=fill,"
        "drawbox=x=iw*0.32:y=ih*0.35:w=iw*0.2:h=ih*0.36:color=0xe4d2a4:t=fill,"
        "drawbox=x=iw*0.59:y=ih*0.55:w=iw*0.17:h=ih*0.16:color=0xf8ebd1:t=fill,"
        "drawtext=text='MOCK / DEMO':fontsize=24:fontcolor=white:x=(w-tw)/2:y=35,"
        "drawtext=text='Not AI generated':fontsize=16:fontcolor=white:x=(w-tw)/2:y=h-55,"
        "drawtext=text='Frame creative studio':fontsize=15:fontcolor=0x786844:x=w*0.33:y=h*0.49"
    )
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"color=c=0xa8af96:s={width}x{height}:d=3:r=24", "-vf", filters, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination / f"{name}.mp4")], check=True)
