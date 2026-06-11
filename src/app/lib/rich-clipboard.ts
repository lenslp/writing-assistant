export async function writeRichClipboard(html: string, plainText: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("当前环境不支持剪贴板写入。");
  }

  const ClipboardItemCtor = globalThis.ClipboardItem;

  if (ClipboardItemCtor && typeof navigator.clipboard.write === "function") {
    const item = new ClipboardItemCtor({
      "text/html": new Blob([html], { type: "text/html;charset=utf-8" }),
      "text/plain": new Blob([plainText], { type: "text/plain;charset=utf-8" }),
    });

    await navigator.clipboard.write([item]);
    return;
  }

  await navigator.clipboard.writeText(plainText);
}
