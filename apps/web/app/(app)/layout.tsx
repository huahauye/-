import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function AppLayout({children}:{children:React.ReactNode}){try{await requireUser()}catch{redirect("/login")}return children}
