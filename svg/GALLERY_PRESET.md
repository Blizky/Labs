# SVG Gallery Preset

Use this preset for icon gallery pages like `index.html`.

## Current UI Configuration

- Container shape: square
- Container size: `84px` x `84px`
- Icon size: `28px` x `28px`
- Label text in cards: hidden (icon-only)
- Click behavior: copy filename to clipboard

## CSS Settings

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 84px);
  gap: 10px;
  justify-content: start;
}

.icon-btn {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: grid;
  place-items: center;
}

.icon-preview {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
```

## Reuse Notes

- Keep each icon in its own clickable `.icon-btn`.
- Use icon filename as tooltip/title and copy value.
- For other SVG libraries, replace the `icons` filename array only.
