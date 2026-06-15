"use client";

import React, { useEffect, useImperativeHandle } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { escapeHtml } from "../lib/format-render";

export type EditorToolbarMode =
  | "undo"
  | "redo"
  | "paragraph"
  | "heading"
  | "bold"
  | "italic"
  | "underline"
  | "list"
  | "orderedList"
  | "quote"
  | "divider"
  | "code";

export type RichTextEditorStyle = React.CSSProperties & {
  "--editor-divider-color"?: string;
};

export type RichTextEditorHandle = {
  getSelectedText: () => string;
  replaceSelection: (text: string) => string;
  runCommand: (mode: EditorToolbarMode) => void;
  focus: () => void;
};

export type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  editorStyle: RichTextEditorStyle;
};

type TiptapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string }>;
  content?: TiptapNode[];
};

function collapseChineseQuoteLayers(text: string) {
  let normalized = text;
  let previous = "";

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(/「{2,}([^「」]+)」{2,}/g, "「$1」");
  }

  return normalized;
}

function renderEditorInlineHtml(text: string) {
  return escapeHtml(collapseChineseQuoteLayers(text))
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/「([^」]+)」/g, "<em>「$1」</em>");
}

function wrapItalicEditorText(text: string) {
  const normalized = collapseChineseQuoteLayers(text);

  if (/^「[^「」]+」$/.test(normalized)) {
    return normalized;
  }

  return `「${normalized}」`;
}

function renderPlainSectionAsEditorHtml(section: string) {
  const lines = section.split("\n");
  const trimmed = section.trim();
  const codeMatch = trimmed.match(/^```(\w+)?\s*\n([\s\S]*?)\n```$/);

  if (codeMatch) {
    return `<pre><code>${escapeHtml(codeMatch[2])}</code></pre>`;
  }

  if (trimmed === "---") {
    return "<hr />";
  }

  if (trimmed.startsWith("## ")) {
    return `<h2>${renderEditorInlineHtml(trimmed.slice(3).trim())}</h2>`;
  }

  if (trimmed.startsWith(">")) {
    const quote = lines.map((line) => line.replace(/^>\s?/, "")).join("\n");
    return `<blockquote><p>${renderEditorInlineHtml(quote).replace(/\n/g, "<br />")}</p></blockquote>`;
  }

  if (lines.length > 1 && lines.every((line) => line.trim().startsWith("- "))) {
    const items = lines
      .map((line) => `<li><p>${renderEditorInlineHtml(line.trim().replace(/^- /, ""))}</p></li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }

  if (lines.length > 1 && lines.every((line) => /^\d+[.)、]\s+/.test(line.trim()))) {
    const items = lines
      .map((line) => `<li><p>${renderEditorInlineHtml(line.trim().replace(/^\d+[.)、]\s+/, ""))}</p></li>`)
      .join("");
    return `<ol>${items}</ol>`;
  }

  return `<p>${renderEditorInlineHtml(trimmed).replace(/\n/g, "<br />")}</p>`;
}

function plainTextToEditorHtml(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const sections: string[] = [];
  let buffer: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    const section = buffer.join("\n").trim();
    if (section) sections.push(section);
    buffer = [];
  };

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (!inCodeBlock && buffer.length) flush();
      buffer.push(line);
      inCodeBlock = !inCodeBlock;
      if (!inCodeBlock) flush();
      continue;
    }

    if (!inCodeBlock && !trimmed) {
      flush();
      continue;
    }

    buffer.push(line);
  }

  flush();
  return sections.map(renderPlainSectionAsEditorHtml).join("");
}

function extractInlineTextFromEditorNode(node?: TiptapNode): string {
  if (!node) return "";

  if (node.type === "hardBreak") return "\n";

  if (typeof node.text === "string") {
    const markTypes = node.marks?.map((mark) => mark.type).filter(Boolean) ?? [];
    let text = node.text;

    if (markTypes.includes("italic")) text = wrapItalicEditorText(text);
    if (markTypes.includes("bold") || markTypes.includes("underline")) text = `__${text}__`;

    return collapseChineseQuoteLayers(text);
  }

  return node.content?.map(extractInlineTextFromEditorNode).join("") ?? "";
}

function extractListItemText(node: TiptapNode) {
  return node.content
    ?.map((child) => {
      if (child.type === "paragraph") return extractInlineTextFromEditorNode(child).trim();
      return extractBlockTextFromEditorNode(child).trim();
    })
    .filter(Boolean)
    .join("\n") ?? "";
}

function extractBlockTextFromEditorNode(node: TiptapNode): string {
  if (node.type === "heading") {
    return `## ${extractInlineTextFromEditorNode(node).trim()}`;
  }

  if (node.type === "blockquote") {
    const content = node.content?.map(extractBlockTextFromEditorNode).filter(Boolean).join("\n") ?? "";
    return content
      .split("\n")
      .map((line) => `> ${line.replace(/^>\s?/, "")}`)
      .join("\n");
  }

  if (node.type === "bulletList") {
    return node.content?.map((item) => `- ${extractListItemText(item)}`).join("\n") ?? "";
  }

  if (node.type === "orderedList") {
    return node.content?.map((item, index) => `${index + 1}. ${extractListItemText(item)}`).join("\n") ?? "";
  }

  if (node.type === "horizontalRule") {
    return "---";
  }

  if (node.type === "codeBlock") {
    const language = typeof node.attrs?.language === "string" ? node.attrs.language : "";
    return [`\`\`\`${language}`, extractInlineTextFromEditorNode(node), "```"].join("\n");
  }

  return extractInlineTextFromEditorNode(node).trim();
}

function editorJsonToPlainText(json: TiptapNode) {
  return json.content
    ?.map(extractBlockTextFromEditorNode)
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n") ?? "";
}

export const RichTextEditor = React.forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor({ value, onChange, disabled, placeholder, editorStyle }, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: plainTextToEditorHtml(value),
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "article-rich-editor__content",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      onChange(editorJsonToPlainText(activeEditor.getJSON() as TiptapNode));
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;

    const currentText = editorJsonToPlainText(editor.getJSON() as TiptapNode);
    if (currentText === value.trim()) return;

    editor.commands.setContent(plainTextToEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  useImperativeHandle(ref, () => ({
    getSelectedText() {
      if (!editor) return "";
      const { from, to } = editor.state.selection;
      if (from === to) return "";
      return editor.state.doc.textBetween(from, to, "\n").trim();
    },
    replaceSelection(text: string) {
      if (!editor) return value;
      editor.chain().focus().insertContent(plainTextToEditorHtml(text) || escapeHtml(text)).run();
      return editorJsonToPlainText(editor.getJSON() as TiptapNode);
    },
    runCommand(mode: EditorToolbarMode) {
      if (!editor) return;

      if (mode === "undo") editor.chain().focus().undo().run();
      if (mode === "redo") editor.chain().focus().redo().run();
      if (mode === "paragraph") editor.chain().focus().setParagraph().run();
      if (mode === "heading") editor.chain().focus().toggleHeading({ level: 2 }).run();
      if (mode === "bold") editor.chain().focus().toggleBold().run();
      if (mode === "italic") editor.chain().focus().toggleItalic().run();
      if (mode === "underline") editor.chain().focus().toggleUnderline().run();
      if (mode === "list") editor.chain().focus().toggleBulletList().run();
      if (mode === "orderedList") editor.chain().focus().toggleOrderedList().run();
      if (mode === "quote") editor.chain().focus().toggleBlockquote().run();
      if (mode === "divider") editor.chain().focus().setHorizontalRule().run();
      if (mode === "code") editor.chain().focus().toggleCodeBlock().run();
    },
    focus() {
      editor?.chain().focus().run();
    },
  }), [editor, value]);

  return (
    <div className="article-rich-editor flex-1" style={editorStyle}>
      <style jsx>{`
        .article-rich-editor :global(.article-rich-editor__content hr) {
          border: none;
          border-top: 2px solid var(--editor-divider-color, currentColor);
          margin: 1.5em 0;
        }
      `}</style>
      <EditorContent editor={editor} />
    </div>
  );
});
