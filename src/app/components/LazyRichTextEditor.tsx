"use client";

import React, { Suspense, useImperativeHandle, useRef } from "react";
import type {
  RichTextEditorHandle,
  RichTextEditorProps,
} from "./RichTextEditor";

const RichTextEditor = React.lazy(() =>
  import("./RichTextEditor").then((module) => ({ default: module.RichTextEditor })),
);

function RichTextEditorLoading() {
  return (
    <div className="flex min-h-[260px] flex-1 items-center justify-center rounded-[18px] border border-dashed border-border bg-background text-[12px] text-muted-foreground">
      编辑器加载中...
    </div>
  );
}

export const LazyRichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function LazyRichTextEditor(props, ref) {
    const editorRef = useRef<RichTextEditorHandle>(null);

    useImperativeHandle(ref, () => ({
      getSelectedText: () => editorRef.current?.getSelectedText() ?? "",
      replaceSelection: (text) => editorRef.current?.replaceSelection(text) ?? props.value,
      runCommand: (mode) => editorRef.current?.runCommand(mode),
      focus: () => editorRef.current?.focus(),
    }), [props.value]);

    return (
      <Suspense fallback={<RichTextEditorLoading />}>
        <RichTextEditor ref={editorRef} {...props} />
      </Suspense>
    );
  },
);

