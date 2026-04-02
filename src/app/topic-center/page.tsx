import { Suspense } from "react";
import { TopicCenter } from "../components/TopicCenter";

function TopicCenterFallback() {
  return <div className="p-8 text-sm text-gray-500">正在加载选题中心...</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<TopicCenterFallback />}>
      <TopicCenter />
    </Suspense>
  );
}
