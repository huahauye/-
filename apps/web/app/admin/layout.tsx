import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function AdminLayout({children}:{children:React.ReactNode}){try{await requireAdmin()}catch{redirect("/cases")}return children}
