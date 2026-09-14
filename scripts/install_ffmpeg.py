#!/usr/bin/env python3
"""Instala uma build portável do ffmpeg via imageio-ffmpeg, sem depender do
Homebrew. Usado como fallback por `make setup`."""
from __future__ import annotations

import shutil
import subprocess
import sys


def main() -> int:
    if shutil.which("ffmpeg"):
        print("ffmpeg já está disponível no PATH.")
        return 0

    try:
        import imageio_ffmpeg
    except ImportError:
        print("Instalando imageio-ffmpeg (build portável do ffmpeg)...")
        subprocess.run([sys.executable, "-m", "pip", "install", "imageio-ffmpeg"], check=True)
        import imageio_ffmpeg  # type: ignore

    exe_path = imageio_ffmpeg.get_ffmpeg_exe()
    print(f"ffmpeg portável disponível em: {exe_path}")
    print("Se algo precisar do binário no PATH, exporte:")
    print(f'  export PATH="{exe_path.rsplit("/", 1)[0]}:$PATH"')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
