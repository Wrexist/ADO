# ControlOS commercial

42-second, 1920×1080 product film built from real app screens (demo data, dark theme).
Copy is a first draft to edit in `commercial.html` (`SCENES` and the scene markup).

1. `node --import tsx marketing/commercial/capture.mts` captures the screens (2×) into `build/shots/`.
2. Open `commercial.html` in a browser for a live preview.
3. `FFMPEG=<path to ffmpeg> node --import tsx marketing/commercial/render.mts` renders
   `build/controlos-commercial.mp4` frame by frame (H.264, CRF 16, 30 fps).
   `--stills 2,12,24` renders single frames for review.

The film is silent; add licensed music in an editor. `build/` is not committed.
