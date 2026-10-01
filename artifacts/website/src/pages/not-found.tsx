import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useSeo } from "@/lib/useSeo";

export default function NotFound() {
  useSeo({
    title: "Page Not Found | Koastal Kollective",
    description: "That page doesn't exist. Head back to Koastal Kollective for computer, Mac and game console repairs across the Central Coast & Lake Macquarie.",
    noindex: true,
  });

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            The page you're looking for has moved or doesn't exist. Try our <a href="/" className="text-[#007b7d] underline">home page</a>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
