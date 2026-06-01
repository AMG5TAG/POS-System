import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, ApiError } from "@workspace/api-client-react";
import { useAuth } from "@/lib/use-auth";
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
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LockKeyholeIcon, TriangleAlertIcon } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const loginMutation = useLogin();

  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState<number>(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = (seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setLockSecondsLeft(seconds);
    countdownRef.current = setInterval(() => {
      setLockSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const isLocked = lockSecondsLeft > 0;

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginValues) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setLockMessage(null);
          setLockSecondsLeft(0);
          setAttemptsRemaining(null);
          login(data);
          toast.success("Successfully logged in");
          setLocation("/dashboard");
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 429) {
            const retryAfterHeader = err.headers?.get("Retry-After");
            const retryAfterSecs = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
            const bodyMessage =
              typeof err.data === "object" &&
              err.data !== null &&
              "error" in err.data &&
              typeof (err.data as Record<string, unknown>).error === "string"
                ? (err.data as Record<string, unknown>).error as string
                : "Account temporarily locked. Please try again later.";
            setAttemptsRemaining(null);
            setLockMessage(bodyMessage);
            startCountdown(isNaN(retryAfterSecs) ? 60 : retryAfterSecs);
          } else if (err instanceof ApiError && err.status === 401) {
            const remaining =
              typeof err.data === "object" &&
              err.data !== null &&
              "attemptsRemaining" in err.data &&
              typeof (err.data as Record<string, unknown>).attemptsRemaining === "number"
                ? (err.data as Record<string, unknown>).attemptsRemaining as number
                : null;
            setAttemptsRemaining(remaining);
            toast.error("Invalid email or password");
          } else {
            setAttemptsRemaining(null);
            toast.error("Invalid email or password");
          }
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <img src="/logo.png" alt="KoaPOS" className="mx-auto w-16 h-16 object-contain mb-2" />
          <CardTitle className="text-2xl font-bold tracking-tight">Log in to KoaPOS</CardTitle>
          <CardDescription>Enter your email below to log in to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lockMessage && (
            <Alert variant="destructive">
              <LockKeyholeIcon className="h-4 w-4" />
              <AlertTitle>Account temporarily locked</AlertTitle>
              <AlertDescription>
                {lockMessage}
                {isLocked && (
                  <span className="block mt-1 font-medium">
                    You can try again in{" "}
                    <span className="tabular-nums">{formatCountdown(lockSecondsLeft)}</span>.
                  </span>
                )}
                {!isLocked && (
                  <span className="block mt-1">You may try again now.</span>
                )}
                <span className="block mt-2">
                  Forgot your password?{" "}
                  <Link href="/forgot-password" className="font-medium underline">
                    Reset your password
                  </Link>{" "}
                  to unlock your account immediately.
                </span>
              </AlertDescription>
            </Alert>
          )}
          {!lockMessage && attemptsRemaining !== null && attemptsRemaining <= 2 && (
            <Alert variant="destructive">
              <TriangleAlertIcon className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                {attemptsRemaining === 0
                  ? "Your account has been temporarily locked due to too many failed attempts."
                  : attemptsRemaining === 1
                    ? "1 attempt remaining before your account is temporarily locked."
                    : `${attemptsRemaining} attempts remaining before your account is temporarily locked.`}
              </AlertDescription>
            </Alert>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="m@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
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
                disabled={loginMutation.isPending || isLocked}
              >
                {loginMutation.isPending
                  ? "Logging in..."
                  : isLocked
                    ? `Locked — try in ${formatCountdown(lockSecondsLeft)}`
                    : "Log in"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-center gap-2">
          <div className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
