import { Suspense } from "react";
import { WritingPage } from "../components/WritingPage";

function WritingPageFallback() {
  return <div className="p-8 text-sm text-gray-500">正在加载写作工作台...</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<WritingPageFallback />}>
      <WritingPage />
    </Suspense>
  );
}
