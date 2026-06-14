import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 mb-4">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2">Last updated: June 2025</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Overview</h2>
            <p>KoaPOS ("we", "us", "our") is committed to protecting your privacy. This policy explains how we collect, use, store, and disclose personal information in accordance with the Australian Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Information We Collect</h2>
            <p>We collect information you provide directly:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Account information:</strong> business name, owner name, email address, phone number, ABN.</li>
              <li><strong>Business data:</strong> products, customers, transactions, staff, and inventory records you enter into the platform.</li>
              <li><strong>Technical data:</strong> IP address, browser type, login timestamps for security purposes.</li>
              <li><strong>Payment information:</strong> processed by our payment provider; we do not store card numbers.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and improve the KoaPOS service.</li>
              <li>To send transactional and account-related emails (receipts, password resets, security alerts).</li>
              <li>To detect and prevent fraud and unauthorised access.</li>
              <li>To comply with legal obligations.</li>
            </ul>
            <p className="mt-2">We do not sell, rent, or trade your personal information to third parties for marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Data Storage and Security</h2>
            <p>Your data is stored in secure, encrypted databases hosted in Australia or equivalent jurisdictions. We use AES-256-GCM encryption for sensitive credentials and TLS for all data in transit. Access is restricted to authorised personnel only.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Data Retention</h2>
            <p>We retain your data for as long as your account is active. Upon account closure, your data is deleted within 30 days, except where retention is required by law (e.g. financial records required under the Tax Administration Act 1953).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Your Rights</h2>
            <p>Under the Australian Privacy Act, you have the right to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Access the personal information we hold about you.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Request deletion of your personal information (subject to legal obligations).</li>
              <li>Lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at <a href="https://oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">oaic.gov.au</a>.</li>
            </ul>
            <p className="mt-2">To exercise these rights, contact us at <a href="mailto:privacy@koapos.com" className="text-primary hover:underline">privacy@koapos.com</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Cookies</h2>
            <p>We use a single session cookie to keep you logged in. We do not use tracking cookies or third-party advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Third-Party Services</h2>
            <p>When you connect integrations (e.g. Xero, Google, Stripe), your data may be shared with those providers subject to their own privacy policies. We store integration tokens encrypted in our database and never expose them to the browser.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Notifiable Data Breaches</h2>
            <p>In the event of a data breach likely to result in serious harm, we will notify affected individuals and the OAIC as required under the Notifiable Data Breaches scheme.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">10. Changes to This Policy</h2>
            <p>We may update this policy periodically. We will notify you of material changes via email. Continued use of the Service after notification constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
            <p>Privacy enquiries: <a href="mailto:privacy@koapos.com" className="text-primary hover:underline">privacy@koapos.com</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
