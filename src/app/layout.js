import "./globals.css";

export const metadata = {
  title: "AasaMedChem | Inventory & Order Management",
  description: "High-precision chemical inventory and quotation system with multi-unit conversions and role-based access control.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
