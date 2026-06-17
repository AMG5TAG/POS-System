import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

const schema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

function useToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("token");
}

export default function StaffResetPasswordPage() {
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const token = useToken();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: FormValues) => {
    if (!token) {
      setErrorMsg("This link is missing or invalid. Please request a new one.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/staff-auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: values.newPassword }),
      });
      if (r.ok) {
        setDone(true);
      } else {
        const data = await r.json().catch(() => null);
        setErrorMsg(
          data && typeof data.error === "string"
            ? data.error
            : "This link is invalid or has expired. Please request a new one.",
        );
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <img src="/logo.png" alt="KoaPOS" className="mx-auto w-48 h-48 object-contain mb-4 rounded-full ring-2 ring-primary/20" />
          <CardTitle className="text-2xl font-bold tracking-tight">Set your staff password</CardTitle>
          <CardDescription>
            Choose a password to sign in to KoaPOS with your email. Your register PIN stays the same.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <Alert>
              <CheckCircle2Icon className="h-4 w-4" />
              <AlertDescription>
                Your password has been set.{" "}
                <Link href="/login" className="font-medium underline">
                  Sign in now
                </Link>
              </AlertDescription>
            </Alert>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {errorMsg && (
                  <Alert variant="destructive">
                    <TriangleAlertIcon className="h-4 w-4" />
                    <AlertDescription>{errorMsg}</AlertDescription>
                  </Alert>
                )}
                {!token && (
                  <Alert variant="destructive">
                    <TriangleAlertIcon className="h-4 w-4" />
                    <AlertDescription>This link is missing or invalid. Ask your manager to resend the invite.</AlertDescription>
                  </Alert>
                )}
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={submitting || !token}>
                  {submitting ? "Saving…" : "Set password"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Back to login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
