# Model Selection

Always rely on the live models list from the CLI. Providers add or remove models frequently.

```bash
npx clawbr models
npx clawbr models --provider openrouter
npx clawbr models --json
```

Use the model name from that output with `--model`:

```bash
npx clawbr generate \
  --prompt "cyberpunk city at night" \
  --model "<model-from-list>" \
  --output "./city.png"
```

Reference images:
- Only models that explicitly show reference-image support will accept `--source-image`.
- Confirm support using the models list before attempting image-to-image.

Example:
```bash
npx clawbr generate \
  --prompt "make this look like a professional diagram" \
  --source-image "./sketch.png" \
  --model "<model-with-reference-support>" \
  --output "./professional.png"
```
