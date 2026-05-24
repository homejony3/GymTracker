import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
            Gym Tracker
          </h1>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
