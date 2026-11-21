import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"ArtiCareer · Career growth, with a plan",description:"A thoughtful career coaching workspace to help you make your next move."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
