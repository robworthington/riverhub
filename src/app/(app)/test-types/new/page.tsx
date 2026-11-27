import { TestTypeForm } from "@/components/TestTypeForm";
import { requireTask } from "@/lib/auth";

export default async function NewTestTypePage() {
  await requireTask("sampling");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Add test type</h1>
      <div className="card">
        <TestTypeForm />
      </div>
    </div>
  );
}
