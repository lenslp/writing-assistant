import { Suspense } from "react";
import { AuthPage } from "../components/AuthPage";

function LoginFallback() {
  return <main className="flex min-h-screen items-center justify-center bg-background text-[13px] text-muted-foreground">正在加载登录页...</main>;
}

export default function Page() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <AuthPage />
    </Suspense>
  );
}
