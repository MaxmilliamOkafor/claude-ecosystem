# Extension icons

Place the following PNGs here before running `pnpm --filter claude-extension build`:

- `icon-16.png`
- `icon-32.png`
- `icon-48.png`
- `icon-128.png`

Any square PNG works. The build pipeline copies them into `dist/` as-is
because they are referenced from `manifest.json`.

If you want to reuse the official Anthropic glyph from the downloaded
reference extension, copy `/tmp/dce/icon-128.png` into this directory and
generate the smaller sizes with `convert` or an online resizer.
