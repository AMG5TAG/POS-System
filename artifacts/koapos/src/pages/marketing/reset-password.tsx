import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useResetPassword, ApiError } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
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
  const m = window.location.search.match(/[?&]token=([^&]*)/);
  if (!m) return null;
  // Read the token WITHOUT the "+"→space conversion that URLSearchParams does,
  // which would corrupt a base64 token in an unencoded reset link and make the
  // server reject it as "invalid or expired". Tokens never contain real spaces.
  try { return decodeURIComponent(m[1].replace(/\+/g, "%2B")); } catch { return m[1]; }
}

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mutation = useResetPassword();
  const token = useToken();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = (values: FormValues) => {
    if (!token) {
      setErrorMsg("Reset link is missing or invalid. Please request a new one.");
      return;
    }
    setErrorMsg(null);
    mutation.mutate(
      { data: { token, newPassword: values.newPassword } },
      {
        onSuccess: () => setDone(true),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 400) {
            const msg =
              typeof err.data === "object" &&
              err.data !== null &&
              "error" in err.data &&
              typeof (err.data as Record<string, unknown>).error === "string"
                ? (err.data as Record<string, unknown>).error as string
                : "This reset link is invalid or has expired. Please request a new one.";
            setErrorMsg(msg);
          } else {
            setErrorMsg("Something went wrong. Please try again.");
          }
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <img src="/logo.png" alt="KoaPOS" className="mx-auto w-48 h-48 object-contain mb-4 rounded-full ring-2 ring-primary/20" />
          <CardTitle className="text-2xl font-bold tracking-tight">Set new password</CardTitle>
          <CardDescription>
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <Alert>
              <CheckCircle2Icon className="h-4 w-4" />
              <AlertDescription>
                Your password has been reset.{" "}
                <Link href="/login" className="font-medium underline">
                  Log in now
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
                    <AlertDescription>
                      Reset link is missing or invalid.{" "}
                      <Link href="/forgot-password" className="font-medium underline">
                        Request a new one.
                      </Link>
                    </AlertDescription>
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
                <Button
                  type="submit"
                  className="w-full"
                  disabled={mutation.isPending || !token}
                >
                  {mutation.isPending ? "Resetting…" : "Reset password"}
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
