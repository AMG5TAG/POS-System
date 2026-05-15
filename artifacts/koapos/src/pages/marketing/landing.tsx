import { MarketingLayout } from "@/components/layout/marketing-layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function LandingPage() {
  return (
    <MarketingLayout>
      <section className="py-24 md:py-32 overflow-hidden bg-background">
        <div className="container mx-auto px-4 md:px-8 text-center max-w-4xl">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8">
            The POS built for modern <span className="text-primary">Australian retail</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            KoaPOS is the reliable workhorse your retail business needs. Fast on a tablet, deeply connected, and designed for professionals who move fast.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8">Start your free trial</Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">View Pricing</Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
