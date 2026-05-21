# _starter — custom widget scaffold

Use this directory as the starting point for a new custom (from-scratch) widget.

---

## Authoring steps

1. **Copy** this entire directory to `rooms/<game>/pxd/widgets/<your-id>/`.
2. **Rename** CSS class prefixes from `starter-*` to something unique for your
   widget (e.g. `wd-vault-*`). Update both `widget.js` and `widget.css`.
3. **Set `STATE_TOPIC`** (required) and `COMMAND_TOPIC` if the widget publishes
   commands.
4. **Implement `render(value)`** — update the DOM to reflect the current state.
5. **Implement `onMessage(payload)`** — parse the MQTT payload and call `render()`.
6. **Build the HTML** in `mount(bodyEl)` — inject your markup into `bodyEl`.
7. **Clean up** in `unmount()` — unsubscribe and release DOM references.
8. **Update `room.json`** — add the widget entry and ensure `"widgets"` is in
   `panels.include`.
9. **Run the packager.**

---

## Edit order

| Step | What to change |
|---|---|
| 1 | `STATE_TOPIC` (and `COMMAND_TOPIC` if interactive) |
| 2 | Other CONFIG values for your use case |
| 3 | Class prefix (`starter-*` → your prefix) in both files |
| 4 | `render()` — DOM updates for your state |
| 5 | `onMessage()` — payload parsing |
| 6 | `mount()` — HTML structure injected into `bodyEl` |
| 7 | `unmount()` — cleanup |
| 8 | `widget.css` — styles matching your HTML |

---

## Tips

- Keep all configuration in the `CONFIG` block — makes future edits obvious.
- Use `_escapeHtml()` when injecting any string into `innerHTML`.
- Subscribe only inside `mount()` and unsubscribe inside `unmount()`.
- If interactive, add a click listener inside `mount()` and remove it in `unmount()`.
- See [docs/WIDGETS.md](../../../docs/WIDGETS.md) for the full contract reference.
