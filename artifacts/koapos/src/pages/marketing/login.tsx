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
import { CheckCircleIcon, LockKeyholeIcon, TriangleAlertIcon, ArrowBigUpIcon } from "lucide-react";

const WARN_THRESHOLD = 5;
const LOCKOUT_STORAGE_KEY = "koapos_lockout_expiry";

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

  const holdCleared = new URLSearchParams(window.location.search).get("holdCleared") === "1";

  const [capsLockOn, setCapsLockOn] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState<number>(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = (seconds: number, expiryIso?: string) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (expiryIso) {
      localStorage.setItem(LOCKOUT_STORAGE_KEY, expiryIso);
    }
    setLockSecondsLeft(seconds);
    countdownRef.current = setInterval(() => {
      setLockSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          localStorage.removeItem(LOCKOUT_STORAGE_KEY);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    const stored = localStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (stored) {
      const msLeft = new Date(stored).getTime() - Date.now();
      if (msLeft > 0) {
        const secsLeft = Math.ceil(msLeft / 1000);
        setLockMessage("Account temporarily locked. Please try again later.");
        startCountdown(secsLeft);
      } else {
        localStorage.removeItem(LOCKOUT_STORAGE_KEY);
      }
    }
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
          localStorage.removeItem(LOCKOUT_STORAGE_KEY);
          login(data);
          toast.success("Successfully logged in");
          setLocation("/dashboard");
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 429) {
            const body = typeof err.data === "object" && err.data !== null
              ? (err.data as Record<string, unknown>)
              : {};
            const bodyMessage =
              typeof body.error === "string"
                ? body.error
                : "Account temporarily locked. Please try again later.";
            // Prefer the ISO retryAfter timestamp from the body; fall back to Retry-After header seconds
            let retryAfterSecs = 60;
            let retryAfterIso: string | undefined;
            if (typeof body.retryAfter === "string") {
              retryAfterIso = body.retryAfter;
              const msLeft = new Date(body.retryAfter).getTime() - Date.now();
              retryAfterSecs = Math.max(1, Math.ceil(msLeft / 1000));
            } else {
              const retryAfterHeader = err.headers?.get("Retry-After");
              const parsed = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
              retryAfterSecs = isNaN(parsed) ? 60 : parsed;
              retryAfterIso = new Date(Date.now() + retryAfterSecs * 1000).toISOString();
            }
            setAttemptsRemaining(null);
            setLockMessage(bodyMessage);
            startCountdown(retryAfterSecs, retryAfterIso);
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
          {holdCleared && (
            <Alert className="border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100">
              <CheckCircleIcon className="h-4 w-4 text-green-600" />
              <AlertTitle>Account hold cleared</AlertTitle>
              <AlertDescription>
                Your account hold has been lifted. You can now log in below.
              </AlertDescription>
            </Alert>
          )}
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
          {!lockMessage && attemptsRemaining !== null && attemptsRemaining > 2 && attemptsRemaining <= WARN_THRESHOLD && (
            <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <TriangleAlertIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>
                {`${attemptsRemaining} attempts remaining before your account is temporarily locked.`}
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
                      <Input
                        type="password"
                        {...field}
                        onKeyDown={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
                        onKeyUp={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
                      />
                    </FormControl>
                    {capsLockOn && (
                      <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                        <ArrowBigUpIcon className="h-4 w-4 shrink-0" />
                        Caps Lock is on
                      </p>
                    )}
                    <FormMessage />
                    <div className="text-right">
                      <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
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
