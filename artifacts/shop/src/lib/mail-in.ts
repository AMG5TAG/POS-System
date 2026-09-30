import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface MailInInfo {
  enabled: boolean;
  businessName: string;
  phone: string | null;
  email: string | null;
  addressLines: string[];
  openingHours: { day: string; hours: string }[];
  returnText: string;
  extraNotes: string;
  terms: string[];
  /** The POS's service device types, in its order. */
  deviceTypes: string[];
  /** Of those, media sent as a batch (VHS, DVD, …) rather than one device. */
  mediaDeviceTypes: string[];
}

export interface MailInStatusView {
  reference: string;
  status: "awaiting_postage" | "in_transit" | "received" | "cancelled";
  firstName: string;
  device: string;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  submittedAt: string;
  receivedAt: string | null;
  addressLines?: string[];
}

/* Same ids as the API's MAIL_IN_CARRIERS (and the POS's order-tracking list). */
export const CARRIERS = [
  { id: "auspost", name: "Australia Post" },
  { id: "startrack", name: "StarTrack" },
  { id: "couriers", name: "Couriers Please" },
  { id: "fastway", name: "Aramex (Fastway)" },
  { id: "tnt", name: "TNT Express" },
  { id: "dhl", name: "DHL Express" },
  { id: "fedex", name: "FedEx" },
  { id: "sendle", name: "Sendle" },
  { id: "other", name: "Other" },
];

export const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

export const useMailInInfo = () =>
  useQuery({ queryKey: ["shop-mail-in"], queryFn: () => api<MailInInfo>("/shop/mail-in"), staleTime: 5 * 60_000 });

export const addTracking = (token: string, carrier: string, trackingNumber: string) =>
  api<MailInStatusView>(`/shop/mail-in/track/${token}`, { method: "POST", body: JSON.stringify({ carrier, trackingNumber }) });
