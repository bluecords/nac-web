# phone-overlay-check

Drives a real phone browser (Edge/Chrome over adb) with real touches and checks how pop-ups open and close.
Read-only: it opens and dismisses layers and never chooses an action or sends anything.

    adb -s <serial> forward tcp:9445 localabstract:chrome_devtools_remote
    OUT=<folder for screenshots> node run.mjs

Every case starts from a fresh load of one channel and first checks the layer really opened. See
claude-repo `DESIGN_OVERLAY_CONTRACT.md` for what it measures and why. `adb shell input tap` is NOT used: it is not
a faithful finger (nac-server `.claude/rules/environment.md`). Edit the serial, the channel URL and the touch
coordinates at the top of `run.mjs` for another device.
