export async function writeRichClipboard(html: string, plainText: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard API is unavailable");
  }

  const ClipboardItemCtor = globalThis.ClipboardItem;

  if (ClipboardItemCtor) {
    const item = new ClipboardItemCtor({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainText], { type: "text/plain" }),
    });

    await navigator.clipboard.write([item]);
    return;
  }

  await navigator.clipboard.writeText(plainText);
}
