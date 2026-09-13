import { jameelNoori, notoNastaliq } from "@/lib/fonts";
import "./globals.css";

export const metadata = {
  title: "Order Booking",
  description: "Order booking, rate management, and Excel export",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jameelNoori.variable} ${notoNastaliq.variable}`}>
      <body>{children}</body>
    </html>
  );
}