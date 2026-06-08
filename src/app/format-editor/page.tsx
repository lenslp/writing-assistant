import { Suspense } from "react";
import { FormatEditor } from "../components/FormatEditor";

function FormatEditorFallback() {
  return <div className="p-8 text-sm text-[#8c8178]">正在加载排版编辑器...</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<FormatEditorFallback />}>
      <FormatEditor />
    </Suspense>
  );
}
