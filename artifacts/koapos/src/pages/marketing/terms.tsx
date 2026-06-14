import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 mb-4">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="text-muted-foreground mt-2">Last updated: June 2025</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
            <p>By creating an account or using KoaPOS ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Description of Service</h2>
            <p>KoaPOS is a subscription-based point-of-sale platform for Australian retail merchants. We provide tools for sales, inventory, customer management, and reporting.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Account Registration</h2>
            <p>You must provide accurate, current, and complete information during registration. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Subscription and Billing</h2>
            <p>Access to KoaPOS requires a paid subscription. Fees are billed in advance on a monthly or annual basis. All prices are in Australian Dollars (AUD) and include GST where applicable. Subscriptions auto-renew unless cancelled before the renewal date.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Acceptable Use</h2>
            <p>You agree not to use the Service to: (a) violate any applicable laws or regulations; (b) transmit unlawful, harmful, or fraudulent content; (c) interfere with the integrity or performance of the Service; or (d) attempt to gain unauthorised access to any systems or networks.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Data Ownership</h2>
            <p>You retain ownership of all data you input into KoaPOS (products, customers, transactions, etc.). We do not sell your data to third parties. You may export your data at any time via Management → Import/Export.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Service Availability</h2>
            <p>We strive for high availability but do not guarantee uninterrupted access. Scheduled maintenance will be communicated in advance where possible. We are not liable for losses resulting from service unavailability.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, KoaPOS and its operators are not liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Termination</h2>
            <p>You may close your account at any time via Settings → Account. We reserve the right to suspend or terminate accounts that violate these Terms. Upon termination, your data will be deleted in accordance with our Privacy Policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">10. Changes to Terms</h2>
            <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms. We will notify you of material changes via email.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">11. Governing Law</h2>
            <p>These Terms are governed by the laws of New South Wales, Australia. Any disputes will be subject to the exclusive jurisdiction of the courts of New South Wales.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">12. Contact</h2>
            <p>Questions about these Terms? Contact us at <a href="mailto:legal@koapos.com" className="text-primary hover:underline">legal@koapos.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
