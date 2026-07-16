import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "cooklog-notebook.blizky.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Cooklog — a quiet cookbook",
    description: "A simple place to keep recipes, ingredients, and cooking notes.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "Cooklog", description: "Good food, well remembered.", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Cooklog", description: "Good food, well remembered.", images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
