import "./globals.css";

export const metadata = {
  title: "Order Booking System",
  description: "Order booking, rate management, and Excel export",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{ display: "flex", gap: 16, padding: "12px 24px", borderBottom: "1px solid #ddd", fontFamily: "system-ui, sans-serif" }}>
          <a href="/orders">Orders</a>
          <a href="/rates">Rates</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
