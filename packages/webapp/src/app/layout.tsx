import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

// Load wagmi/RainbowKit providers client-side only — they access localStorage at init
const Providers = dynamic(
  () => import("./providers").then((m) => m.Providers),
  { ssr: false }
);

export const metadata: Metadata = {
  title: "Persona — ZK Proof of Humanity",
  description:
    "Verify your humanity on-chain using zero-knowledge proofs. No PII stored.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
