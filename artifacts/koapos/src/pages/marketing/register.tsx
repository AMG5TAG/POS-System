import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRegister, useListPlans } from "@workspace/api-client-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const registerSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  ownerName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  planId: z.coerce.number().optional(),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const registerMutation = useRegister();
  
  const { data: plans, isLoading: plansLoading } = useListPlans({
    query: {
      queryKey: ["plans"]
    }
  });

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      businessName: "",
      ownerName: "",
      email: "",
      phone: "",
      password: "",
      planId: undefined,
    },
  });

  const onSubmit = (values: RegisterValues) => {
    registerMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          login(data);
          toast.success("Account created successfully");
          setLocation("/dashboard");
        },
        onError: () => {
          toast.error("Registration failed. Please check your details.");
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1 text-center">
          <img src="/logo.png" alt="KoaPOS" className="mx-auto w-16 h-16 object-contain mb-2" />
          <CardTitle className="text-2xl font-bold tracking-tight">Create an account</CardTitle>
          <CardDescription>Enter your details to start using KoaPOS</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Retail" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ownerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owner Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="m@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+61 400 000 000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="planId"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Select a Plan</FormLabel>
                    <FormControl>
                      {plansLoading ? (
                        <div className="flex justify-center p-4"><Spinner /></div>
                      ) : (
                        <RadioGroup
                          onValueChange={(val) => field.onChange(parseInt(val, 10))}
                          defaultValue={field.value?.toString()}
                          className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                          {plans?.map((plan) => (
                            <div key={plan.id} className="relative">
                              <RadioGroupItem
                                value={plan.id.toString()}
                                id={`plan-${plan.id}`}
                                className="peer sr-only"
                              />
                              <Label
                                htmlFor={`plan-${plan.id}`}
                                className="flex flex-col rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                              >
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-bold">{plan.name}</span>
                                  <span className="text-xl font-bold">{formatCurrency(plan.priceMonthly)}<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
                                </div>
                                <span className="text-sm text-muted-foreground line-clamp-2">{plan.description}</span>
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" size="lg" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center border-t p-6">
          <div className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Log in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
