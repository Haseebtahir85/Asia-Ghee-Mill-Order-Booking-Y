import "./globals.css";

export const metadata = {
  title: "Order Booking",
  description: "Order booking, rate management, and Excel export",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
