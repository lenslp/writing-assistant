import { Suspense } from "react";
import { ReviewCenter } from "../components/ReviewCenter";

function ReviewCenterFallback() {
  return <div className="p-8 text-sm text-gray-500">正在加载审核中心...</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<ReviewCenterFallback />}>
      <ReviewCenter />
    </Suspense>
  );
}
