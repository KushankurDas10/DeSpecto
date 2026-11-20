import "server-only";
import { handleAuditRequest } from "../../../../apps/api/handler.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleAuditRequest;
export const HEAD = handleAuditRequest;
export const POST = handleAuditRequest;
export const DELETE = handleAuditRequest;
