import { auth } from "@/lib/auth/server";

type Ctx = { params: Promise<{ path: string[] }> };

let handler: ReturnType<ReturnType<typeof auth>["handler"]> | undefined;
const h = () => (handler ??= auth().handler());

export const GET = (req: Request, ctx: Ctx) => h().GET(req, ctx);
export const POST = (req: Request, ctx: Ctx) => h().POST(req, ctx);
