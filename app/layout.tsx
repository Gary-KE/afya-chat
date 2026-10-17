import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Afya Chat · health guidance on web and WhatsApp",
  description: "Describe how you feel and get clear next steps, in English or Kiswahili."
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0F5132" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
