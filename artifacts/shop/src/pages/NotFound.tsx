import { Link } from "wouter";
export default function NotFound() {
  return <div className="py-32 text-center space-y-3"><p className="text-lg font-medium">Page not found</p><Link href="/" className="text-brand-dark underline">Go to the shop</Link></div>;
}
